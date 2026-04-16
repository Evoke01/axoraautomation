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
        tags: true,
        intelligence: true
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
    asset: { title: string; rawNotes: string | null; creator: { niche: string | null; brandVoice: string | null; name: string }; intelligence?: any },
    file: { durationSeconds: number | null }
  ): Promise<AIVariant[]> {
    const fileShape = file.durationSeconds && file.durationSeconds <= 60 ? "short-form" : "long-form";

    const systemPrompt = `You are Axora, a world-class YouTube growth strategist. 
    Your mission is to generate metadata that "blows up" using high-intensity hooks, curiosity gaps, and trending styles.
    Eliminate boring corporate-speak. Use "Power Words" and focus on the ONE big thing that makes this video unique.
    
    Return ONLY a JSON array of 3 objects. 
    Keys: variantKey ("viral", "curiosity", "direct"), title (max 50 chars, punchy), hook (1 sentence), caption (max 150 chars), cta (short), hashtags (array of 4), keywords (array of 5).`;

    const intelligenceInfo = asset.intelligence ? `
    ACTUAL VIDEO CONTENT (SCANNED):
    - Hook: ${asset.intelligence.hook}
    - Main Point: ${asset.intelligence.mainPoint}
    - Vibe: ${asset.intelligence.vibe}
    - Specific Topics: ${asset.intelligence.keywords?.join(", ")}
    ` : "No video scan available yet.";

    const userPrompt = `Creator: ${asset.creator.name}
    Niche: ${asset.creator.niche ?? "general"}
    Brand voice: ${asset.creator.brandVoice ?? "bold and energetic"}
    ${intelligenceInfo}
    Video title: ${asset.title}
    Notes: ${asset.rawNotes ?? "none"}
    Format: ${fileShape} (${file.durationSeconds ?? "unknown"}s)

    Generate 3 distinct metadata variants optimized for high CTR.`;

    const response = await ai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 800
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "[]";

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    const raw = JSON.parse(cleaned);
    const parsed: AIVariant[] = Array.isArray(raw) ? raw : [raw];
    if (parsed.length === 0) { throw new Error("AI returned invalid format"); }
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
        variantKey: "viral",
        title: `CRACKED: ${titleCase(keywordPool[0] ?? "This strategy")} finally revealed`,
        hook: `The ${hookBase.toLowerCase()} angle that ${asset.creator.name} is using to dominate`,
        caption: `Forget everything you know about ${contentCategory.toLowerCase()}. We just found the ultimate shortcut.`,
        cta: "Join Axora for the full distribution wave.",
        thumbnailBrief: `High-contrast thumbnail featuring ${contentCategory} and the word 'CRACKED'.`,
        hashtags: keywordPool.slice(0, 4).map((keyword) => `#${keyword}`),
        keywords: keywordPool
      },
      {
        variantKey: "curiosity",
        title: `Stop failing at ${titleCase(keywordPool[0] ?? "this niche")} right now`,
        hook: `Nobody is timing ${contentCategory.toLowerCase()} correctly, except for this`,
        caption: `We found a massive whitespace opportunity in ${contentCategory.toLowerCase()}. Watch till the end.`,
        cta: "Unlock the next move with Axora.",
        thumbnailBrief: `Minimal thumbnail with the word 'STOP' and a sharp contrast number.`,
        hashtags: keywordPool.slice(0, 3).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 5)
      },
      {
        variantKey: "direct",
        title: `How to MASTER ${contentCategory} (${Math.max(1, Math.round(file.durationSeconds ?? 30))}s)`,
        hook: `${asset.title}: The only guide you need`,
        caption: `No fluff. Just the facts about ${hookBase}. This is ${fileShape} excellence.`,
        cta: "Save this before it goes viral.",
        thumbnailBrief: `Outcome-first thumbnail with sharp text and zero distractions.`,
        hashtags: keywordPool.slice(0, 2).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 4)
      }
    ];
  }
}


