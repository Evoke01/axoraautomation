import crypto from "node:crypto";

import { Platform, type PrismaClient } from "@prisma/client";

import { NotFoundError } from "../lib/errors.js";
import { MultiAgentService } from "./multi-agent-service.js";

interface MetadataVariantDraft {
  variantKey: string;
  title: string;
  hook: string;
  caption: string;
  cta: string;
  thumbnailBrief: string;
  hashtags: string[];
  keywords: string[];
  modelVersion?: string;
}

export class MetadataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: MultiAgentService
  ) {}

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

    let variants = await this.agents.generateMetadataVariants({
      title: asset.title,
      rawNotes: asset.rawNotes,
      creatorName: asset.creator.name,
      creatorNiche: asset.creator.niche,
      creatorBrandVoice: asset.creator.brandVoice,
      durationSeconds: file.durationSeconds,
      intelligence:
        asset.intelligence && typeof asset.intelligence === "object"
          ? (asset.intelligence as Record<string, unknown>)
          : null
    });

    if (!variants || variants.length === 0) {
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
            modelVersion:
              variant.modelVersion ??
              `heuristic-${crypto
                .createHash("sha1")
                .update(asset.updatedAt.toISOString())
                .digest("hex")
                .slice(0, 8)}`
          }
        })
      )
    );

    const keywordPool = buildKeywordPool([
      asset.title,
      asset.rawNotes ?? "",
      asset.creator.niche ?? "",
      asset.creator.brandVoice ?? "",
      ...(asset.intelligence && typeof asset.intelligence === "object"
        ? normalizeUnknownStringArray((asset.intelligence as Record<string, unknown>).keywords)
        : []),
      ...variants.flatMap((variant) => variant.keywords)
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

  private generateHeuristic(
    asset: {
      title: string;
      rawNotes: string | null;
      creator: { name: string; niche: string | null; brandVoice: string | null };
      intelligence: unknown;
    },
    file: { durationSeconds: number | null }
  ): MetadataVariantDraft[] {
    const intelligenceKeywords =
      asset.intelligence && typeof asset.intelligence === "object"
        ? normalizeUnknownStringArray((asset.intelligence as Record<string, unknown>).keywords)
        : [];
    const keywordPool = buildKeywordPool([
      asset.title,
      asset.rawNotes ?? "",
      asset.creator.niche ?? "",
      asset.creator.brandVoice ?? "",
      ...intelligenceKeywords
    ]);

    const contentCategory = keywordPool[0] ? titleCase(keywordPool[0]) : "Creator Strategy";
    const hookBase = keywordPool[1] ? titleCase(keywordPool[1]) : "Growth";
    const fileShape = file.durationSeconds && file.durationSeconds <= 60 ? "short-form" : "long-form";

    return [
      {
        variantKey: "primary",
        title: `${asset.title}: ${hookBase} playbook`,
        hook: `The ${hookBase.toLowerCase()} angle creators keep missing.`,
        caption: `${asset.title}. Built for ${fileShape} attention around ${contentCategory.toLowerCase()}.`,
        cta: "Follow Axora for the next wave.",
        thumbnailBrief: `High-contrast thumbnail featuring ${contentCategory} and one bold promise.`,
        hashtags: keywordPool.slice(0, 4).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 8),
        modelVersion: "heuristic-primary"
      },
      {
        variantKey: "curiosity",
        title: `Why ${titleCase(keywordPool[0] ?? "this niche")} is opening up now`,
        hook: `Nobody is timing ${contentCategory.toLowerCase()} correctly yet.`,
        caption: `This upload is framed around a whitespace opportunity in ${contentCategory.toLowerCase()}.`,
        cta: "Watch the breakdown and track the next move.",
        thumbnailBrief: "Minimal thumbnail with a whitespace claim and one sharp contrast number.",
        hashtags: keywordPool.slice(0, 3).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 5),
        modelVersion: "heuristic-curiosity"
      },
      {
        variantKey: "direct",
        title: `${contentCategory} in ${Math.max(1, Math.round(file.durationSeconds ?? 30))} seconds`,
        hook: `${asset.title} with a sharper, outcome-first angle.`,
        caption: `Direct version for high-intent viewers. Angle: ${hookBase}.`,
        cta: "Save this before the next repackaged drop.",
        thumbnailBrief: "Outcome-first thumbnail with no more than four words.",
        hashtags: keywordPool.slice(0, 2).map((keyword) => `#${keyword}`),
        keywords: keywordPool.slice(0, 4),
        modelVersion: "heuristic-direct"
      }
    ];
  }
}

function buildKeywordPool(source: string[]) {
  const tokens = source
    .flatMap((entry) =>
      entry
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 3)
    )
    .slice(0, 16);

  return [...new Set(tokens)];
}

function normalizeUnknownStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().toLowerCase());
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}
