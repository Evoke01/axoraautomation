import crypto from "node:crypto";

import { Platform, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { getAIClient } from "../lib/ai.js";
import { NotFoundError } from "../lib/errors.js";

function extractKeywords(source: string[]) {
  const text = source.join(" ").toLowerCase();
  const tokens = text
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3)
    .slice(0, 8);

  return [...new Set(tokens)];
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

interface AIVariant {
  variantKey: string;
  title: string;
  hook: string;
  caption: string;
  cta: string;
  thumbnailBrief: string;
  hashtags: string[];
  keywords: string[];
}

export class MetadataService {
  constructor(private readonly prisma: PrismaClient) {}

  async generate(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        creator: true,
        files: true,
        tags: true
      }
    });

    if (!asset || asset.files.length === 0) {
      throw new NotFoundError("Asset was not found.");
    }

    const file = asset.files[0];
    if (!file) {
      throw new NotFoundError("Asset file was not found.");
    }

    let variants: AIVariant[];

    const ai = getAIClient();
    if (ai) {
      try {
        variants = await this.generateWithAI(ai, asset, file);
      } catch (error) {
        console.error("AI metadata generation failed, falling back to heuristic:", error);
        variants = this.generateHeuristic(asset, file);
      }
    } else {
      variants = this.generateHeuristic(asset, file);
    }

    await this.prisma.metadataVariant.deleteMany({
      where: {
        assetId,
        platform: Platform.YOUTUBE
      }
    });

    const created = await Promise.all(
      variants.map((variant) =>
        this.prisma.metadataVariant.create({
          data: {
            assetId,
            platform: Platform.YOUTUBE,
            variantKey: variant.variantKey,
            title: variant.title,
            hook: variant.hook,
            caption: variant.caption,
            cta: variant.cta,
            thumbnailBrief: variant.thumbnailBrief,
            hashtags: variant.hashtags,
            keywords: variant.keywords,
            modelVersion: ai
              ? `${env.OPENAI_MODEL}-${crypto.createHash("sha1").update(asset.updatedAt.toISOString()).digest("hex").slice(0, 8)}`
              : `heuristic-${crypto.createHash("sha1").update(asset.updatedAt.toISOString()).digest("hex").slice(0, 8)}`
          }
        })
      )
    );

    const keywordPool = extractKeywords([
      asset.title,
      asset.rawNotes ?? "",
      asset.creator.niche ?? "",
      asset.creator.brandVoice ?? ""
    ]);

    await this.prisma.assetTag.deleteMany({ where: { assetId } });
    await this.prisma.assetTag.createMany({
      data: keywordPool.map((keyword) => ({
        assetId,
        label: keyword,
        kind: "keyword"
      })),
      skipDuplicates: true
    });

    return created;
  }

  private async generateWithAI(
    ai: InstanceType<typeof import("openai").default>,
    asset: { title: string; rawNotes: string | null; creator: { niche: string | null; brandVoice: string | null; name: string } },
    file: { durationSeconds: number | null }
  ): Promise<AIVariant[]> {
    const fileShape = file.durationSeconds && file.durationSeconds <= 60 ? "short-form" : "long-form";

    const systemPrompt = `You are Axora. Generate YouTube metadata for a creator video. Return ONLY a JSON object (no markdown). Keys: variantKey ("primary"), title (max 70 chars), hook (1 sentence), caption (2 sentences), cta (short), hashtags (array of 4), keywords (array of 5).`;

    const userPrompt = `Creator: ${asset.creator.name}
Niche: ${asset.creator.niche ?? "general"}
Brand voice: ${asset.creator.brandVoice ?? "authentic and engaging"}
Video title: ${asset.title}
Notes: ${asset.rawNotes ?? "none"}
Format: ${fileShape} (${file.durationSeconds ?? "unknown"}s)

Generate 3 metadata variants.`;

    const response = await ai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "[]";

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    const parsed = JSON.parse(cleaned) as AIVariant[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AI returned invalid format");
    }

    return parsed.map((v) => ({
      variantKey: v.variantKey ?? "primary",
      title: v.title ?? asset.title,
      hook: v.hook ?? "",
      caption: v.caption ?? "",
      cta: v.cta ?? "",
      thumbnailBrief: v.thumbnailBrief ?? "",
      hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
      keywords: Array.isArray(v.keywords) ? v.keywords : []
    }));
  }

  private generateHeuristic(
    asset: { title: string; rawNotes: string | null; creator: { niche: string | null; brandVoice: string | null } },
    file: { durationSeconds: number | null }
  ): AIVariant[] {
    const keywordPool = extractKeywords([
      asset.title,
      asset.rawNotes ?? "",
      asset.creator.niche ?? "",
      asset.creator.brandVoice ?? ""
    ]);

    const contentCategory = keywordPool[0] ? titleCase(keywordPool[0]) : "Creator Strategy";
    const hookBase = keywordPool[1] ? titleCase(keywordPool[1]) : "Growth";
    const fileShape = file.durationSeconds && file.durationSeconds <= 60 ? "short-form" : "long-form";

    return [
      {
        variantKey: "primary",
        title: `${asset.title}: ${hookBase} Playbook`,
        hook: `The ${hookBase.toLowerCase()} angle creators keep missing`,
        caption: `${asset.title}\n\nBuilt for ${fileShape} attention. Focus: ${contentCategory}.`,
        cta: "Follow Axora for the next distribution wave.",
        thumbnailBrief: `High-contrast thumbnail featuring ${contentCategory} and one bold promise about ${hookBase.toLowerCase()}.`,
        hashtags: keywordPool.slice(0, 4).map((keyword) => `#${keyword}`),
        keywords: keywordPool
      },
      {
        variantKey: "curiosity",
        title: `Why ${titleCase(keywordPool[0] ?? "this niche")} is opening up right now`,
        hook: `Nobody is timing ${contentCategory.toLowerCase()} correctly yet`,
        caption: `This upload is framed around a whitespace opportunity in ${contentCategory.toLowerCase()}.`,
        cta: "Watch the full breakdown and track the next move.",
        thumbnailBrief: `Minimal thumbnail with a single whitespace claim and a sharp contrast number.`,
        hashtags: keywordPool.slice(0, 3).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 5)
      },
      {
        variantKey: "direct",
        title: `${contentCategory} in ${Math.max(1, Math.round(file.durationSeconds ?? 30))} seconds`,
        hook: `${asset.title} with a sharper outcome`,
        caption: `Direct version for high-intent viewers. Angle: ${hookBase}.`,
        cta: "Save this before the next repackaged drop.",
        thumbnailBrief: `Outcome-first thumbnail with creator face optional and no more than four words.`,
        hashtags: keywordPool.slice(0, 2).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 4)
      }
    ];
  }
}

