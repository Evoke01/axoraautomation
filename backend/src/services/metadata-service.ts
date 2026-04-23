import crypto from "node:crypto";

import { Platform, type PrismaClient } from "@prisma/client";

import { NotFoundError } from "../lib/errors.js";
import { buildCreatorProfilePack } from "./learning-service.js";
import { MultiAgentService, type MetadataPipelineResult } from "./multi-agent-service.js";

type PersistableVariant = {
  variantKey: string;
  angle: "curiosity" | "authority" | "controversy";
  title: string;
  hook: string;
  caption: string;
  cta: string;
  thumbnailBrief: string;
  hashtags: string[];
  keywords: string[];
  score?: number;
  rationale?: string;
  modelVersion?: string;
};

export class MetadataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly agents: MultiAgentService
  ) {}

  async generate(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        workspace: true,
        creator: {
          include: {
            learningProfile: true
          }
        },
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

    const pipeline =
      (await this.agents
        .generateMetadataPipeline({
          workspaceId: asset.workspaceId,
          timezone: asset.workspace.timezone,
          title: asset.title,
          rawNotes: asset.rawNotes,
          creatorName: asset.creator.name,
          creatorNiche: asset.creator.niche,
          creatorBrandVoice: asset.creator.brandVoice,
          creatorProfilePack: buildCreatorProfilePack(asset.creator.learningProfile),
          durationSeconds: file.durationSeconds,
          intelligence:
            asset.intelligence && typeof asset.intelligence === "object"
              ? (asset.intelligence as Record<string, unknown>)
              : null
        })
        .catch(() => null)) ??
      buildHeuristicPipeline(asset, file);

    await this.prisma.metadataVariant.deleteMany({
      where: {
        assetId,
        platform: Platform.YOUTUBE
      }
    });

    const created = await Promise.all(
      pipeline.variants.map((variant, index) =>
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
            score: variant.score ?? 0,
            angle: variant.angle,
            isSelected: index === 0,
            reasoning: variant.rationale ?? null,
            niche: pipeline.classification.niche,
            viralScore: pipeline.classification.viralScore,
            scheduledDay: pipeline.schedule.dayOfWeek,
            scheduledHour: pipeline.schedule.hourLocal,
            agentTrace: pipeline.agentTrace as any,
            processingMs: pipeline.processingMs,
            modelVersion:
              variant.modelVersion ??
              `heuristic-${crypto
                .createHash("sha1")
                .update(asset.updatedAt.toISOString())
                .digest("hex")
                .slice(0, 8)}`
          } as any
        })
      )
    );

    const intelligence = asset.intelligence && typeof asset.intelligence === "object"
      ? (asset.intelligence as Record<string, unknown>)
      : {};
    const mergedIntelligence = {
      ...intelligence,
      classification: pipeline.classification,
      schedule: pipeline.schedule,
      metadataProcessingMs: pipeline.processingMs
    };

    const keywordPool = buildKeywordPool([
      asset.title,
      asset.rawNotes ?? "",
      asset.creator.niche ?? "",
      asset.creator.brandVoice ?? "",
      ...normalizeUnknownStringArray(readValue(intelligence, "keywords")),
      ...pipeline.variants.flatMap((variant) => variant.keywords)
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

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        intelligence: mergedIntelligence as any
      }
    });

    return created;
  }
}

function buildHeuristicPipeline(
  asset: {
    title: string;
    rawNotes: string | null;
    updatedAt: Date;
    creator: { niche: string | null; brandVoice: string | null };
    intelligence: unknown;
  },
  file: { durationSeconds: number | null }
): MetadataPipelineResult {
  const intelligence =
    asset.intelligence && typeof asset.intelligence === "object"
      ? (asset.intelligence as Record<string, unknown>)
      : null;
  const keywordPool = buildKeywordPool([
    asset.title,
    asset.rawNotes ?? "",
    asset.creator.niche ?? "",
    asset.creator.brandVoice ?? "",
    ...normalizeUnknownStringArray(readValue(intelligence, "keywords"))
  ]);

  const variants: PersistableVariant[] = [
    {
      variantKey: "curiosity",
      angle: "curiosity",
      title: `Why ${titleCase(keywordPool[0] ?? "this niche")} is moving now`,
      hook: `The ${keywordPool[1] ?? "timing"} angle most creators miss.`,
      caption: clipText(`${asset.title}. Built around a curiosity-first hook for short-form retention.`, 160),
      cta: "Watch to the end for the full breakdown.",
      thumbnailBrief: "Curiosity-led text with one unresolved promise.",
      hashtags: keywordPool.slice(0, 5),
      keywords: keywordPool.slice(0, 6),
      score: 0.71,
      rationale: "Heuristic curiosity-first winner.",
      modelVersion: "heuristic-curiosity"
    },
    {
      variantKey: "authority",
      angle: "authority",
      title: `${titleCase(keywordPool[0] ?? "Creator")} playbook that still works`,
      hook: `Here is the framework I would use again.`,
      caption: clipText(`${asset.title}. Direct expert framing with the most useful takeaway first.`, 160),
      cta: "Save this for the next upload.",
      thumbnailBrief: "Expert framing with one proof point.",
      hashtags: keywordPool.slice(0, 5),
      keywords: keywordPool.slice(0, 6),
      score: 0.65,
      rationale: "Heuristic authority angle.",
      modelVersion: "heuristic-authority"
    },
    {
      variantKey: "controversy",
      angle: "controversy",
      title: `Most people get ${titleCase(keywordPool[0] ?? "content")} wrong`,
      hook: `The common advice here is overrated.`,
      caption: clipText(`${asset.title}. Contrarian framing that stays brand-safe and discussion-friendly.`, 160),
      cta: "Comment if you disagree.",
      thumbnailBrief: "Bold statement with a sharp contrast claim.",
      hashtags: keywordPool.slice(0, 5),
      keywords: keywordPool.slice(0, 6),
      score: 0.59,
      rationale: "Heuristic controversy angle.",
      modelVersion: "heuristic-controversy"
    }
  ];

  return {
    insights: {
      hook: readString(intelligence, "hook") ?? asset.title,
      mainPoint: readString(intelligence, "mainPoint") ?? asset.rawNotes ?? asset.title,
      vibe: readString(intelligence, "vibe") ?? "educational",
      keywords: keywordPool.slice(0, 6),
      summary: readString(intelligence, "summary") ?? asset.title
    },
    variants,
    classification: {
      niche: asset.creator.niche ?? keywordPool[0] ?? "general",
      nicheConfidence: 0.35,
      engagementLabel: "steady evergreen interest",
      engagementConfidence: 0.3,
      viralScore: file.durationSeconds && file.durationSeconds <= 60 ? 0.58 : 0.44,
      provider: "heuristic"
    },
    schedule: {
      dayOfWeek: 2,
      hourLocal: 18,
      minuteLocal: 0,
      confidence: 0.5,
      rationale: "Heuristic local evening schedule.",
      provider: "heuristic"
    },
    processingMs: 0,
    agentTrace: [
      {
        agent: "metadata-fallback",
        model: "heuristic",
        latencyMs: 0,
        cached: false,
        success: true
      }
    ]
  };
}

function buildKeywordPool(source: string[]) {
  const tokens = source
    .flatMap((entry) =>
      entry
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 3)
    )
    .slice(0, 20);

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

function readValue(record: Record<string, unknown> | null, key: string) {
  return record ? record[key] : undefined;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = readValue(record, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength - 1).trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}
