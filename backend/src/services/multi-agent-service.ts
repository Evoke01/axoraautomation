import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env.js";
import type { AIOrchestrator } from "../ai/orchestrator.js";

type BaseIntelligence = {
  hook: string;
  mainPoint: string;
  vibe: string;
  keywords: string[];
  summary: string;
};

type EnrichedIntelligence = BaseIntelligence & {
  nicheLabel: string;
  nicheConfidence: number;
  engagementLabel: string;
  engagementConfidence: number;
  trendAngles: string[];
  providers: string[];
};

type MetadataVariantDraft = {
  variantKey: string;
  title: string;
  hook: string;
  caption: string;
  cta: string;
  thumbnailBrief: string;
  hashtags: string[];
  keywords: string[];
  modelVersion?: string;
  score?: number;
  rationale?: string;
};

type ScheduleRecommendation = {
  scheduledFor: Date;
  rationale: string;
  confidence: number;
  provider: string;
};

type WriterContext = {
  title: string;
  rawNotes: string | null;
  creatorName: string;
  creatorNiche: string | null;
  creatorBrandVoice: string | null;
  durationSeconds: number | null;
  intelligence: Record<string, unknown> | null;
};

type ScheduleContext = {
  workspaceId: string;
  timezone: string;
  creatorName: string;
  creatorNiche: string | null;
  assetTitle: string;
  assetIntelligence: Record<string, unknown> | null;
};

type ClassificationResult = {
  label: string;
  score: number;
};

export class MultiAgentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: AIOrchestrator
  ) {}

  async enrichIntelligence(
    context: {
      title: string;
      rawNotes: string | null;
      creatorNiche: string | null;
      baseProvider: "gemini" | "heuristic";
    },
    intelligence: BaseIntelligence
  ): Promise<EnrichedIntelligence> {
    const baseText = [
      context.title,
      context.rawNotes ?? "",
      intelligence.hook,
      intelligence.mainPoint,
      intelligence.vibe,
      intelligence.summary,
      intelligence.keywords.join(" ")
    ]
      .filter(Boolean)
      .join("\n");

    const nicheLabels = [
      "education",
      "productivity",
      "technology",
      "business",
      "marketing",
      "lifestyle",
      "finance",
      "self-improvement",
      "storytelling",
      "entertainment"
    ];
    const engagementLabels = [
      "high viral potential",
      "steady evergreen interest",
      "niche expert interest",
      "low immediate pull"
    ];

    try {
      const [nicheScores, engagementScores] = await Promise.all([
        this.zeroShotClassify(baseText, nicheLabels),
        this.zeroShotClassify(baseText, engagementLabels)
      ]);

      const nicheTop = nicheScores[0];
      const engagementTop = engagementScores[0];

      return {
        ...intelligence,
        nicheLabel: nicheTop?.label ?? context.creatorNiche ?? "general",
        nicheConfidence: nicheTop?.score ?? 0.4,
        engagementLabel: engagementTop?.label ?? this.heuristicEngagementLabel(intelligence.vibe),
        engagementConfidence: engagementTop?.score ?? 0.35,
        trendAngles: nicheScores.slice(0, 3).map((entry) => entry.label),
        providers: [context.baseProvider, nicheTop || engagementTop ? "huggingface" : "heuristic"]
      };
    } catch {
      return {
        ...intelligence,
        nicheLabel: context.creatorNiche ?? intelligence.keywords[0] ?? "general",
        nicheConfidence: 0.35,
        engagementLabel: this.heuristicEngagementLabel(intelligence.vibe),
        engagementConfidence: 0.3,
        trendAngles: intelligence.keywords.slice(0, 3),
        providers: [context.baseProvider, "heuristic"]
      };
    }
  }

  async generateMetadataVariants(context: WriterContext): Promise<MetadataVariantDraft[] | null> {
    const variants = await this.generateWriterVariants(context);
    if (!variants || variants.length === 0) {
      return null;
    }

    const optimized = await this.optimizeVariants(context, variants);
    const optimizerSuffix = optimized.usedOptimizer ? "+mistral" : "";

    return optimized.variants.map((variant) => ({
      ...variant,
      modelVersion: `orchestrator:cascade${optimizerSuffix}`
    }));
  }

  async recommendSchedule(context: ScheduleContext): Promise<ScheduleRecommendation | null> {
    if (!env.COHERE_API_KEY) {
      return null;
    }

    const recentPosts = await this.prisma.platformPost.findMany({
      where: {
        workspaceId: context.workspaceId,
        platform: "YOUTUBE",
        publishedAt: {
          not: null
        }
      },
      include: {
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      },
      orderBy: { publishedAt: "desc" },
      take: 12
    });

    const analyticsSummary = recentPosts.map((post) => ({
      publishedAt: post.publishedAt?.toISOString() ?? null,
      views: post.snapshots[0]?.views ?? 0,
      likes: post.snapshots[0]?.likes ?? 0
    }));

    const response = await fetch(env.COHERE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.COHERE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.COHERE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Axora Scheduler. Return only JSON with keys dayOffset, hourLocal, minuteLocal, confidence, rationale. Pick the best local publish slot for a YouTube post."
          },
          {
            role: "user",
            content: JSON.stringify({
              timezone: context.timezone,
              creatorName: context.creatorName,
              creatorNiche: context.creatorNiche ?? "general",
              assetTitle: context.assetTitle,
              intelligence: context.assetIntelligence,
              recentPosts: analyticsSummary
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere scheduling failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      message?: { content?: Array<{ text?: string }> };
    };
    const content = payload.message?.content?.[0]?.text ?? "{}";
    const parsed = safeJsonParse(content);

    if (!parsed) {
      return null;
    }

    const dayOffset = clampNumber(parsed.dayOffset, 0, 6, 1);
    const hourLocal = clampNumber(parsed.hourLocal, 0, 23, 18);
    const minuteLocal = normalizeMinute(parsed.minuteLocal);
    const confidence = clampNumber(parsed.confidence, 0, 1, 0.55);

    const zonedNow = toZonedTime(new Date(), context.timezone);
    const localSlot = new Date(zonedNow);
    localSlot.setDate(localSlot.getDate() + dayOffset);
    localSlot.setHours(hourLocal, minuteLocal, 0, 0);

    if (localSlot <= zonedNow) {
      localSlot.setDate(localSlot.getDate() + 1);
    }

    return {
      scheduledFor: fromZonedTime(localSlot, context.timezone),
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.length > 0
          ? parsed.rationale
          : "Scheduled from Cohere timing recommendation.",
      confidence,
      provider: `cohere:${env.COHERE_MODEL}`
    };
  }

  private async generateWriterVariants(context: WriterContext): Promise<MetadataVariantDraft[] | null> {
    if (!this.orchestrator.isAvailable) {
      return null;
    }

    const promptContent = JSON.stringify({
      creatorName: context.creatorName,
      creatorNiche: context.creatorNiche ?? "general",
      creatorBrandVoice: context.creatorBrandVoice ?? "direct and energetic",
      assetTitle: context.title,
      rawNotes: context.rawNotes ?? "",
      durationSeconds: context.durationSeconds,
      intelligence: context.intelligence
    });

    const variantSchema = z.object({
      variants: z.array(z.object({
        variantKey: z.string(),
        title: z.string(),
        hook: z.string(),
        caption: z.string(),
        cta: z.string(),
        thumbnailBrief: z.string(),
        hashtags: z.array(z.string()),
        keywords: z.array(z.string())
      })).length(3)
    });

    try {
      const result = await this.orchestrator.complete({
        prompt: [
          {
            role: "system",
            content: "You are Axora Writer. Return one JSON object with a `variants` array of exactly 3 metadata variants. Each variant must include variantKey, title, hook, caption, cta, thumbnailBrief, hashtags, keywords. Keep titles under 70 chars, captions compact, hashtags 3-5 entries, keywords 4-8 entries."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        schema: variantSchema,
        temperature: 0.8,
        maxTokens: 2048
      });

      const rawVariants = result.content.variants ?? [];
      return rawVariants
        .map((entry, index) => normalizeVariant(entry, index))
        .filter((entry): entry is MetadataVariantDraft => Boolean(entry));
    } catch {
      return null;
    }
  }

  private async optimizeVariants(
    context: WriterContext,
    variants: MetadataVariantDraft[]
  ): Promise<{ variants: MetadataVariantDraft[]; usedOptimizer: boolean }> {
    if (!env.MISTRAL_API_KEY) {
      return { variants, usedOptimizer: false };
    }

    const response = await fetch(env.MISTRAL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.MISTRAL_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Axora Optimizer. Score each variant for CTR and retention. Return JSON with `selectedVariantKey` and `scores` where each score item has variantKey, score (0-1), rationale."
          },
          {
            role: "user",
            content: JSON.stringify({
              creatorNiche: context.creatorNiche ?? "general",
              durationSeconds: context.durationSeconds,
              intelligence: context.intelligence,
              variants
            })
          }
        ]
      })
    });

    if (!response.ok) {
      return { variants, usedOptimizer: false };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse(content);
    const scoreEntries = Array.isArray(parsed?.scores) ? parsed.scores : [];
    const selectedVariantKey =
      typeof parsed?.selectedVariantKey === "string" ? parsed.selectedVariantKey : undefined;

    const scoreMap = new Map<string, { score?: number; rationale?: string }>();
    for (const entry of scoreEntries) {
      if (entry && typeof entry === "object" && typeof entry.variantKey === "string") {
        scoreMap.set(entry.variantKey, {
          score: typeof entry.score === "number" ? entry.score : undefined,
          rationale: typeof entry.rationale === "string" ? entry.rationale : undefined
        });
      }
    }

    const enriched = variants.map((variant) => ({
      ...variant,
      score: scoreMap.get(variant.variantKey)?.score,
      rationale: scoreMap.get(variant.variantKey)?.rationale
    }));

    const sorted = [...enriched].sort((left, right) => {
      if (selectedVariantKey) {
        if (left.variantKey === selectedVariantKey) return -1;
        if (right.variantKey === selectedVariantKey) return 1;
      }

      return (right.score ?? 0) - (left.score ?? 0);
    });

    return { variants: sorted, usedOptimizer: true };
  }

  private async zeroShotClassify(
    input: string,
    labels: string[]
  ): Promise<ClassificationResult[]> {
    if (!env.HF_API_TOKEN) {
      return [];
    }

    const response = await fetch(
      `${env.HF_INFERENCE_BASE_URL}/${encodeURIComponent(env.HF_ZERO_SHOT_MODEL)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: input,
          parameters: {
            candidate_labels: labels,
            multi_label: true
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HF inference failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as
      | Array<{ label?: string; score?: number }>
      | { labels?: string[]; scores?: number[] };

    if (Array.isArray(payload)) {
      return payload
        .filter((entry) => typeof entry.label === "string" && typeof entry.score === "number")
        .map((entry) => ({
          label: entry.label as string,
          score: entry.score as number
        }))
        .sort((left, right) => right.score - left.score);
    }

    if (Array.isArray(payload.labels) && Array.isArray(payload.scores)) {
      return payload.labels
        .map((label, index) => ({
          label,
          score: typeof payload.scores?.[index] === "number" ? payload.scores[index]! : 0
        }))
        .sort((left, right) => right.score - left.score);
    }

    return [];
  }

  private heuristicEngagementLabel(vibe: string) {
    const normalized = vibe.toLowerCase();
    if (normalized.includes("high") || normalized.includes("provoc") || normalized.includes("energetic")) {
      return "high viral potential";
    }

    if (normalized.includes("education") || normalized.includes("chill")) {
      return "steady evergreen interest";
    }

    return "niche expert interest";
  }

}

function normalizeVariant(entry: unknown, index: number): MetadataVariantDraft | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const fallbackKey = ["primary", "curiosity", "direct"][index] ?? `variant_${index + 1}`;

  return {
    variantKey:
      typeof candidate.variantKey === "string" && candidate.variantKey.length > 0
        ? candidate.variantKey
        : fallbackKey,
    title: truncateText(asString(candidate.title, "Untitled asset"), 70),
    hook: truncateText(asString(candidate.hook, ""), 140),
    caption: truncateText(asString(candidate.caption, ""), 220),
    cta: truncateText(asString(candidate.cta, ""), 80),
    thumbnailBrief: truncateText(asString(candidate.thumbnailBrief, ""), 180),
    hashtags: normalizeStringArray(candidate.hashtags, 5, "#"),
    keywords: normalizeStringArray(candidate.keywords, 8)
  };
}

function normalizeStringArray(
  value: unknown,
  limit: number,
  prefix = ""
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => `${prefix}${entry.replace(/^#/, "").trim()}`)
    .slice(0, limit);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trim()}...`;
}

function safeJsonParse(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, any>;
  } catch {
    return null;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeMinute(value: unknown) {
  const minute = clampNumber(value, 0, 59, 0);
  const allowed = [0, 15, 30, 45];

  return allowed.reduce((closest, current) =>
    Math.abs(current - minute) < Math.abs(closest - minute) ? current : closest
  );
}
