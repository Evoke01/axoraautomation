import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Platform, type PrismaClient } from "@prisma/client";

import { aiOrchestrator, type VideoContext } from "../ai/metadata-orchestrator.js";

type VisionInsights = {
  hook: string;
  mainPoint: string;
  vibe: string;
  keywords: string[];
  summary: string;
};

type MetadataVariantDraft = {
  variantKey: string;
  angle: "curiosity" | "authority" | "controversy";
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

type ClassificationSummary = {
  niche: string;
  nicheConfidence: number;
  engagementLabel: string;
  engagementConfidence: number;
  viralScore: number;
  provider: string;
};

type CompactSchedule = {
  dayOfWeek: number;
  hourLocal: number;
  minuteLocal: number;
  confidence: number;
  rationale: string;
  provider: string;
};

type ScheduleRecommendation = {
  scheduledFor: Date;
  rationale: string;
  confidence: number;
  provider: string;
};

type MetadataPipelineContext = {
  assetId: string;
  workspaceId: string;
  timezone: string;
  title: string;
  rawNotes: string | null;
  creatorName: string;
  creatorNiche: string | null;
  creatorBrandVoice: string | null;
  creatorProfilePack?: CreatorProfilePack | null;
  durationSeconds: number | null;
  intelligence: Record<string, unknown> | null;
  fileUrl?: string;
};

type AgentTrace = {
  agent: string;
  model: string;
  latencyMs: number;
  cached: boolean;
  success: boolean;
  error?: string;
};

export type MetadataPipelineResult = {
  insights: VisionInsights;
  variants: MetadataVariantDraft[];
  classification: ClassificationSummary;
  schedule: CompactSchedule;
  processingMs: number;
  agentTrace: AgentTrace[];
};

type ClassificationResult = {
  label: string;
  score: number;
};

const ANGLES: Array<{
  key: MetadataVariantDraft["angle"];
  instruction: string;
}> = [
  { key: "curiosity", instruction: "Use curiosity gap and unfinished tension." },
  { key: "authority", instruction: "Lead with expertise, proof, and confidence." },
  { key: "controversy", instruction: "Use a sharp but safe contrarian take." }
];

const NICHE_LABELS = [
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

const ENGAGEMENT_LABELS = [
  "high viral potential",
  "steady evergreen interest",
  "niche expert interest",
  "low immediate pull"
];

export class MultiAgentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: AIOrchestrator
  ) {}

  async generateMetadataPipeline(context: MetadataPipelineContext): Promise<MetadataPipelineResult> {
    const startedAt = Date.now();

    // Prepare context for the new orchestrator
    const videoCtx: VideoContext = {
      assetId: context.assetId,
      workspaceId: context.workspaceId,
      fileUrl: context.fileUrl,
      mimeType: "video/mp4", // default, will be detected by Gemini if URL is provided
      durationSec: context.durationSeconds ?? undefined,
      platform: "YOUTUBE" // default platform
    };

    // Run the multi-agent pipeline
    const result = await aiOrchestrator.run(videoCtx);

    // Map result back to the existing MetadataPipelineResult structure
    return {
      insights: {
        hook: result.insights.hook,
        mainPoint: result.insights.rawSummary.slice(0, 140),
        vibe: result.insights.mood,
        keywords: result.insights.topics,
        summary: result.insights.rawSummary
      },
      variants: result.variants.map((v, i) => {
        const angles: Array<"curiosity" | "authority" | "controversy"> = ["curiosity", "authority", "controversy"];
        const angle = angles[i] ?? "curiosity";
        return {
          variantKey: angle,
          angle: angle,
          title: v.title,
          hook: v.hook,
          caption: v.caption,
          cta: i === 1 ? "Save this for the next upload." : i === 2 ? "Comment if you disagree." : "Watch to the end for the full breakdown.",
          thumbnailBrief: i === 0 ? "Curiosity-led text with one unresolved promise." : i === 1 ? "Expert framing with one proof point." : "Bold statement with a sharp contrast claim.",
          hashtags: v.hashtags,
          keywords: v.keywords,
          score: v.score,
          rationale: v.reasoning,
          modelVersion: buildModelVersion(angle)
        };
      }),
      classification: {
        niche: result.classification.niche,
        nicheConfidence: 0.9,
        engagementLabel: result.classification.viralPotential > 0.7 ? "high viral potential" : "steady evergreen interest",
        engagementConfidence: 0.85,
        viralScore: result.classification.viralPotential,
        provider: "huggingface:bart-large-mnli"
      },
      schedule: {
        dayOfWeek: result.schedule.bestDayOfWeek,
        hourLocal: result.schedule.bestHourUTC, // New scheduler provides UTC, but we map to hourLocal for DB compatibility
        minuteLocal: 0,
        confidence: result.schedule.confidenceScore,
        rationale: result.schedule.reasoning,
        provider: "cohere:command-r"
      },
      processingMs: Date.now() - startedAt,
      agentTrace: result.agentTrace
    };
  }

  async recommendSchedule(context: {
    workspaceId: string;
    timezone: string;
    creatorName: string;
    creatorNiche: string | null;
    creatorProfilePack?: CreatorProfilePack | null;
    assetTitle: string;
    assetIntelligence: Record<string, unknown> | null;
  }): Promise<ScheduleRecommendation | null> {
    const compact = await this.recommendCompactSchedule(
      {
        workspaceId: context.workspaceId,
        timezone: context.timezone,
        title: context.assetTitle,
        rawNotes: null,
        creatorName: context.creatorName,
        creatorNiche: context.creatorNiche,
        creatorBrandVoice: null,
        creatorProfilePack: context.creatorProfilePack,
        durationSeconds: null,
        intelligence: context.assetIntelligence
      },
      normalizeInsights({
        workspaceId: context.workspaceId,
        timezone: context.timezone,
        title: context.assetTitle,
        rawNotes: null,
        creatorName: context.creatorName,
        creatorNiche: context.creatorNiche,
        creatorBrandVoice: null,
        creatorProfilePack: context.creatorProfilePack,
        durationSeconds: null,
        intelligence: context.assetIntelligence
      }),
      {
        niche: context.creatorNiche ?? "general",
        nicheConfidence: 0.4,
        engagementLabel: "steady evergreen interest",
        engagementConfidence: 0.35,
        viralScore: 0.45,
        provider: "heuristic"
      },
      []
    ).catch(() => null);

    if (!compact) {
      return null;
    }

    return {
      scheduledFor: buildScheduledDate(
        context.timezone,
        compact.dayOfWeek,
        compact.hourLocal,
        compact.minuteLocal
      ),
      rationale: compact.rationale,
      confidence: compact.confidence,
      provider: compact.provider
    };
  }

  private async generateAngleVariants(
    context: MetadataPipelineContext,
    insights: VisionInsights,
    trace: AgentTrace[]
  ): Promise<MetadataVariantDraft[]> {
    if (!env.NVIDIA_API_KEY && !env.GROQ_API_KEY) {
      return buildHeuristicVariants(context, insights);
    }

    const useNvidia = !!env.NVIDIA_API_KEY;
    const baseUrl = useNvidia ? env.NVIDIA_BASE_URL : env.GROQ_BASE_URL;
    const apiKey = useNvidia ? env.NVIDIA_API_KEY : env.GROQ_API_KEY;
    const model = useNvidia ? env.NVIDIA_MODEL : env.GROQ_MODEL;

    return Promise.all(
      ANGLES.map(async (angle) => {
        const latencyStartedAt = Date.now();

        try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              temperature: 0.45,
              max_tokens: 220,
              messages: [
                {
                  role: "system",
                  content:
                    'Write YouTube metadata. Return JSON only with keys t,h,c,cta,tb,hs,kw,r. Constraints: title<=68 chars, hook<=90 chars, caption<=160 chars, hashtags=4-6 plain words, keywords=4-6 plain words.'
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    a: angle.instruction,
                    title: clipText(context.title, 80),
                    notes: clipText(context.rawNotes, 120),
                    niche: clipText(context.creatorNiche ?? insights.keywords[0] ?? "general", 30),
                    voice: clipText(context.creatorBrandVoice, 60),
                    profile: compactProfile(context.creatorProfilePack),
                    dur: context.durationSeconds ? Math.round(context.durationSeconds) : null,
                    hook: clipText(insights.hook, 120),
                    point: clipText(insights.mainPoint, 120),
                    vibe: clipText(insights.vibe, 24),
                    summary: clipText(insights.summary, 120),
                    kw: insights.keywords.slice(0, 5)
                  })
                }
              ]
            })
          });

          if (!response.ok) {
            throw new Error(`${useNvidia ? "NVIDIA" : "Groq"} ${response.status}`);
          }

          const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const parsed = safeJsonParse(payload.choices?.[0]?.message?.content ?? "{}");
          const variant = normalizeAngleVariant(parsed, angle.key, context, insights);

          trace.push({
            agent: `writer:${angle.key}`,
            model: model!,
            latencyMs: Date.now() - latencyStartedAt,
            cached: false,
            success: true
          });

          return variant;
        } catch (error) {
          trace.push({
            agent: `writer:${angle.key}`,
            model: model!,
            latencyMs: Date.now() - latencyStartedAt,
            cached: false,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });

          return buildSingleHeuristicVariant(angle.key, context, insights);
        }
      })
    );
  }

  private async classifyContent(
    context: MetadataPipelineContext,
    insights: VisionInsights,
    trace: AgentTrace[]
  ): Promise<ClassificationSummary> {
    const startedAt = Date.now();
    const sourceText = [
      context.title,
      clipText(context.rawNotes, 100),
      clipText(insights.hook, 100),
      clipText(insights.summary, 120),
      insights.keywords.slice(0, 6).join(" ")
    ]
      .filter(Boolean)
      .join(" | ");

    if (!env.HF_API_TOKEN) {
      const heuristic = heuristicClassification(context, insights);
      trace.push({
        agent: "classifier",
        model: "heuristic",
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });
      return heuristic;
    }

    try {
      const [nicheScores, engagementScores] = await Promise.all([
        this.zeroShotClassify(sourceText, NICHE_LABELS),
        this.zeroShotClassify(sourceText, ENGAGEMENT_LABELS)
      ]);

      const nicheTop = nicheScores[0];
      const engagementTop = engagementScores[0];
      const result: ClassificationSummary = {
        niche: nicheTop?.label ?? context.creatorNiche ?? insights.keywords[0] ?? "general",
        nicheConfidence: nicheTop?.score ?? 0.4,
        engagementLabel: engagementTop?.label ?? heuristicEngagementLabel(insights.vibe),
        engagementConfidence: engagementTop?.score ?? 0.35,
        viralScore: deriveViralScore(engagementTop?.label, engagementTop?.score),
        provider: `huggingface:${env.HF_ZERO_SHOT_MODEL}`
      };

      trace.push({
        agent: "classifier",
        model: env.HF_ZERO_SHOT_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });

      return result;
    } catch (error) {
      trace.push({
        agent: "classifier",
        model: env.HF_ZERO_SHOT_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });

      return heuristicClassification(context, insights);
    }
  }

  private async scoreVariants(
    context: MetadataPipelineContext,
    insights: VisionInsights,
    variants: MetadataVariantDraft[],
    trace: AgentTrace[]
  ): Promise<MetadataVariantDraft[]> {
    const startedAt = Date.now();

    if (!env.MISTRAL_API_KEY) {
      const scored = heuristicScoreVariants(variants, insights);
      trace.push({
        agent: "optimizer",
        model: "heuristic",
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });
      return scored;
    }

    try {
      const response = await fetch(env.MISTRAL_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.MISTRAL_MODEL,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Score 3 YouTube variants. Return JSON only: {"w":"variantKey","s":{"key":0.0},"r":{"key":"short reason"}}.'
            },
            {
              role: "user",
              content: JSON.stringify({
                niche: context.creatorNiche ?? insights.keywords[0] ?? "general",
                vibe: clipText(insights.vibe, 24),
                dur: context.durationSeconds ? Math.round(context.durationSeconds) : null,
                profile: compactProfile(context.creatorProfilePack),
                v: variants.map((variant) => ({
                  k: variant.variantKey,
                  t: clipText(variant.title, 68),
                  h: clipText(variant.hook, 90),
                  c: clipText(variant.caption, 100)
                }))
              })
            }
          ],
          max_tokens: 120
        })
      });

      if (!response.ok) {
        throw new Error(`Mistral ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const parsed = safeJsonParse(payload.choices?.[0]?.message?.content ?? "{}");
      const scores = parsed?.s && typeof parsed.s === "object" ? (parsed.s as Record<string, unknown>) : {};
      const reasons = parsed?.r && typeof parsed.r === "object" ? (parsed.r as Record<string, unknown>) : {};
      const winner = typeof parsed?.w === "string" ? parsed.w : undefined;

      const scored = variants
        .map((variant) => ({
          ...variant,
          score: clampScore(scores[variant.variantKey]),
          rationale:
            typeof reasons[variant.variantKey] === "string"
              ? clipText(reasons[variant.variantKey] as string, 80)
              : variant.rationale
        }))
        .sort((left, right) => {
          if (winner) {
            if (left.variantKey === winner) return -1;
            if (right.variantKey === winner) return 1;
          }
          return (right.score ?? 0) - (left.score ?? 0);
        });

      trace.push({
        agent: "optimizer",
        model: env.MISTRAL_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });

      return scored;
    } catch (error) {
      trace.push({
        agent: "optimizer",
        model: env.MISTRAL_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });

      return heuristicScoreVariants(variants, insights);
    }
  }

  private async recommendCompactSchedule(
    context: MetadataPipelineContext,
    insights: VisionInsights,
    classification: ClassificationSummary,
    trace: AgentTrace[]
  ): Promise<CompactSchedule> {
    const startedAt = Date.now();
    const analytics = await this.loadAnalyticsSummary(context.workspaceId, context.timezone);

    if (!env.COHERE_API_KEY) {
      const heuristic = heuristicSchedule(context.timezone, analytics, context.creatorProfilePack);
      trace.push({
        agent: "scheduler",
        model: "heuristic",
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });
      return heuristic;
    }

    try {
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
                'Pick one best local YouTube posting slot. Return JSON only with keys d,h,m,c,r where d=0..6 h=0..23 m in [0,15,30,45].'
            },
            {
              role: "user",
              content: JSON.stringify({
                tz: context.timezone,
                niche: classification.niche,
                viral: Number(classification.viralScore.toFixed(2)),
                vibe: clipText(insights.vibe, 24),
                dur: context.durationSeconds ? Math.round(context.durationSeconds) : null,
                profile: compactProfile(context.creatorProfilePack),
                days: analytics.topDays,
                hours: analytics.topHours
              })
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Cohere ${response.status}`);
      }

      const payload = (await response.json()) as {
        message?: { content?: Array<{ text?: string }> };
      };
      const parsed = safeJsonParse(payload.message?.content?.[0]?.text ?? "{}");
      const recommendation: CompactSchedule = {
        dayOfWeek: clampInteger(parsed?.d, 0, 6, analytics.topDays[0]?.day ?? 2),
        hourLocal: clampInteger(parsed?.h, 0, 23, analytics.topHours[0]?.hour ?? 18),
        minuteLocal: normalizeMinute(parsed?.m),
        confidence: clampScore(parsed?.c),
        rationale:
          typeof parsed?.r === "string" && parsed.r.length > 0
            ? clipText(parsed.r, 120)
            : "Scheduled from compact Cohere timing recommendation.",
        provider: `cohere:${env.COHERE_MODEL}`
      };

      trace.push({
        agent: "scheduler",
        model: env.COHERE_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: true
      });

      return recommendation;
    } catch (error) {
      trace.push({
        agent: "scheduler",
        model: env.COHERE_MODEL,
        latencyMs: Date.now() - startedAt,
        cached: false,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });

      return heuristicSchedule(context.timezone, analytics, context.creatorProfilePack);
    }
  }

  private async zeroShotClassify(input: string, labels: string[]): Promise<ClassificationResult[]> {
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

  private async loadAnalyticsSummary(workspaceId: string, timezone: string) {
    const posts = await this.prisma.platformPost.findMany({
      where: {
        workspaceId,
        platform: Platform.YOUTUBE,
        status: "PUBLISHED",
        publishedAt: { not: null }
      },
      select: {
        publishedAt: true,
        metrics: true
      },
      orderBy: { publishedAt: "desc" },
      take: 24
    });

    const dayBuckets = Array.from({ length: 7 }, (_, day) => ({
      day,
      totalViews: 0,
      count: 0
    }));
    const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      totalViews: 0,
      count: 0
    }));

    for (const post of posts) {
      if (!post.publishedAt) {
        continue;
      }

      const localDate = toZonedTime(post.publishedAt, timezone);
      const views = getMetricValue(post.metrics, "views") || 1;
      const day = localDate.getDay();
      const hour = localDate.getHours();

      dayBuckets[day]!.totalViews += views;
      dayBuckets[day]!.count += 1;
      hourBuckets[hour]!.totalViews += views;
      hourBuckets[hour]!.count += 1;
    }

    const topDays = dayBuckets
      .map((bucket) => ({
        day: bucket.day,
        avgViews: bucket.count > 0 ? Math.round(bucket.totalViews / bucket.count) : 0
      }))
      .sort((left, right) => right.avgViews - left.avgViews)
      .slice(0, 3);

    const topHours = hourBuckets
      .map((bucket) => ({
        hour: bucket.hour,
        avgViews: bucket.count > 0 ? Math.round(bucket.totalViews / bucket.count) : 0
      }))
      .sort((left, right) => right.avgViews - left.avgViews)
      .slice(0, 5);

    return {
      topDays,
      topHours
    };
  }
}

function normalizeInsights(context: MetadataPipelineContext): VisionInsights {
  const intelligence = context.intelligence ?? {};
  const keywords = normalizeStringArray(readValue(intelligence, "keywords"), 6);

  return {
    hook: clipText(
      readString(intelligence, "hook") ??
        context.title,
      120
    ),
    mainPoint: clipText(
      readString(intelligence, "mainPoint") ??
        clipText(context.rawNotes, 140) ??
        context.title,
      140
    ),
    vibe: clipText(
      readString(intelligence, "vibe") ??
        inferVibe(context.rawNotes ?? context.title),
      30
    ),
    keywords:
      keywords.length > 0
        ? keywords
        : fallbackKeywords(context.title, context.rawNotes, context.creatorNiche),
    summary: clipText(
      readString(intelligence, "summary") ??
        [context.title, context.rawNotes ?? ""].filter(Boolean).join(". "),
      160
    )
  };
}

function buildHeuristicVariants(
  context: MetadataPipelineContext,
  insights: VisionInsights
): MetadataVariantDraft[] {
  return ANGLES.map((angle) => buildSingleHeuristicVariant(angle.key, context, insights));
}

function buildSingleHeuristicVariant(
  angle: MetadataVariantDraft["angle"],
  context: MetadataPipelineContext,
  insights: VisionInsights
): MetadataVariantDraft {
  const primaryKeyword = insights.keywords[0] ?? "growth";
  const secondaryKeyword = insights.keywords[1] ?? "strategy";
  const baseTitle =
    angle === "curiosity"
      ? `Why ${titleCase(primaryKeyword)} is shifting now`
      : angle === "authority"
        ? `${titleCase(primaryKeyword)} playbook that actually works`
        : `The ${titleCase(primaryKeyword)} advice most people get wrong`;

  return {
    variantKey: angle,
    angle,
    title: clipText(baseTitle, 68),
    hook:
      angle === "curiosity"
        ? `The ${secondaryKeyword} detail most creators miss.`
        : angle === "authority"
          ? `Here is the ${primaryKeyword} framework I would use again.`
          : `Most people are overcomplicating ${primaryKeyword}.`,
    caption: clipText(
      `${context.title}. ${insights.summary} Built for YouTube with a ${angle} angle.`,
      160
    ),
    cta:
      angle === "authority"
        ? "Save this for the next upload."
        : angle === "controversy"
          ? "Comment if you disagree."
          : "Watch to the end for the full breakdown.",
    thumbnailBrief:
      angle === "controversy"
        ? "Bold statement, high contrast, one disputed claim."
        : angle === "authority"
          ? "Clean expert framing with one proof point."
          : "Curiosity-led text with one unresolved promise.",
    hashtags: insights.keywords.slice(0, 5),
    keywords: insights.keywords.slice(0, 6),
    rationale: `Heuristic ${angle} variant.`,
    modelVersion: buildModelVersion(angle)
  };
}

function normalizeAngleVariant(
  parsed: Record<string, unknown> | null,
  angle: MetadataVariantDraft["angle"],
  context: MetadataPipelineContext,
  insights: VisionInsights
): MetadataVariantDraft {
  const fallback = buildSingleHeuristicVariant(angle, context, insights);

  return {
    variantKey: angle,
    angle,
    title: clipText(readString(parsed, "t") ?? fallback.title, 68),
    hook: clipText(readString(parsed, "h") ?? fallback.hook, 90),
    caption: clipText(readString(parsed, "c") ?? fallback.caption, 160),
    cta: clipText(readString(parsed, "cta") ?? fallback.cta, 80),
    thumbnailBrief: clipText(readString(parsed, "tb") ?? fallback.thumbnailBrief, 140),
    hashtags: normalizeStringArray(readValue(parsed, "hs"), 6),
    keywords: normalizeStringArray(readValue(parsed, "kw"), 6),
    rationale: clipText(readString(parsed, "r") ?? fallback.rationale ?? "", 80),
    modelVersion: buildModelVersion(angle)
  };
}

function heuristicClassification(
  context: MetadataPipelineContext,
  insights: VisionInsights
): ClassificationSummary {
  return {
    niche: context.creatorNiche ?? insights.keywords[0] ?? "general",
    nicheConfidence: 0.35,
    engagementLabel: heuristicEngagementLabel(insights.vibe),
    engagementConfidence: 0.3,
    viralScore: deriveViralScore(heuristicEngagementLabel(insights.vibe), 0.3),
    provider: "heuristic"
  };
}

function heuristicEngagementLabel(vibe: string) {
  const normalized = vibe.toLowerCase();
  if (normalized.includes("high") || normalized.includes("provoc") || normalized.includes("energetic")) {
    return "high viral potential";
  }
  if (normalized.includes("educat") || normalized.includes("tutorial") || normalized.includes("calm")) {
    return "steady evergreen interest";
  }
  return "niche expert interest";
}

function heuristicScoreVariants(variants: MetadataVariantDraft[], insights: VisionInsights) {
  return [...variants]
    .map((variant) => {
      const keywordHits = variant.keywords.filter((keyword) => insights.keywords.includes(keyword)).length;
      const titlePenalty = variant.title.length > 62 ? 0.04 : 0;
      const hookBonus = variant.hook.includes("?") ? 0.06 : 0;
      const angleBonus =
        variant.angle === "curiosity" ? 0.03 : variant.angle === "authority" ? 0.02 : 0.01;
      const score = Math.max(0.35, Math.min(0.92, 0.45 + keywordHits * 0.05 + hookBonus + angleBonus - titlePenalty));

      return {
        ...variant,
        score: Number(score.toFixed(2)),
        rationale: variant.rationale ?? "Heuristic ranking."
      };
    })
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
}

function heuristicSchedule(
  timezone: string,
  analytics: {
    topDays: Array<{ day: number; avgViews: number }>;
    topHours: Array<{ hour: number; avgViews: number }>;
  },
  profile?: CreatorProfilePack | null
): CompactSchedule {
  const preferredWindow = profile?.bestPublishWindows[0] ? parsePublishWindow(profile.bestPublishWindows[0]) : null;
  return {
    dayOfWeek: preferredWindow?.dayOfWeek ?? analytics.topDays[0]?.day ?? 2,
    hourLocal: preferredWindow?.hourLocal ?? analytics.topHours[0]?.hour ?? 18,
    minuteLocal: 0,
    confidence: 0.52,
    rationale: `Scheduled from historical ${timezone} winners.`,
    provider: "heuristic"
  };
}

function buildScheduledDate(
  timezone: string,
  dayOfWeek: number,
  hourLocal: number,
  minuteLocal: number
) {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const candidate = new Date(zonedNow);
  const dayDelta = (dayOfWeek - zonedNow.getDay() + 7) % 7;

  candidate.setDate(candidate.getDate() + dayDelta);
  candidate.setHours(hourLocal, minuteLocal, 0, 0);

  if (candidate <= zonedNow) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return fromZonedTime(candidate, timezone);
}

function deriveViralScore(label: string | undefined, confidence: number | undefined) {
  const safeConfidence = typeof confidence === "number" ? confidence : 0.35;
  if (label === "high viral potential") {
    return Number(Math.min(0.95, 0.62 + safeConfidence * 0.3).toFixed(2));
  }
  if (label === "steady evergreen interest") {
    return Number(Math.min(0.78, 0.42 + safeConfidence * 0.22).toFixed(2));
  }
  if (label === "low immediate pull") {
    return Number(Math.max(0.18, 0.16 + safeConfidence * 0.15).toFixed(2));
  }
  return Number(Math.min(0.68, 0.3 + safeConfidence * 0.2).toFixed(2));
}

function fallbackKeywords(...parts: Array<string | null | undefined>) {
  const tokens = parts
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 3)
    );

  return [...new Set(tokens)].slice(0, 6);
}

function inferVibe(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("tutorial") || normalized.includes("how to") || normalized.includes("breakdown")) {
    return "educational";
  }
  if (normalized.includes("story") || normalized.includes("behind")) {
    return "storytelling";
  }
  if (normalized.includes("controvers") || normalized.includes("hot take")) {
    return "provocative";
  }
  return "high-energy";
}

function getMetricValue(metrics: unknown, key: "views" | "likes" | "comments") {
  if (!metrics || typeof metrics !== "object") return 0;
  const value = (metrics as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.replace(/^#/, "").trim().toLowerCase())
    .slice(0, limit);
}

function readValue(record: Record<string, unknown> | null | undefined, key: string) {
  return record && typeof record === "object" ? record[key] : undefined;
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = readValue(record, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function clipText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 1).trim();
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampScore(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

function normalizeMinute(value: unknown) {
  const minute = clampInteger(value, 0, 59, 0);
  const allowed = [0, 15, 30, 45];
  return allowed.reduce((closest, current) =>
    Math.abs(current - minute) < Math.abs(closest - minute) ? current : closest
  );
}

function buildModelVersion(angle: MetadataVariantDraft["angle"]) {
  return `gemini-groq-hf-mistral-cohere:${angle}`;
}

function compactProfile(profile: CreatorProfilePack | null | undefined) {
  if (!profile) {
    return null;
  }

  const compact = {
    tw: profile.bestTitlePatterns.slice(0, 3),
    ta: profile.avoidTitlePatterns.slice(0, 2),
    kw: profile.bestKeywords.slice(0, 3),
    th: profile.bestThumbnailStyles.slice(0, 2),
    win: profile.bestPublishWindows.slice(0, 3),
    ang: profile.bestAngles.slice(0, 2)
  };

  return Object.values(compact).some((value) => value.length > 0) ? compact : null;
}

function safeJsonParse(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function parsePublishWindow(value: string) {
  const [day, bucket] = value.split("_");
  const dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  };
  const bucketMap: Record<string, number> = {
    morning: 9,
    afternoon: 14,
    evening: 18,
    night: 21
  };

  if (!day || !bucket || !(day in dayMap) || !(bucket in bucketMap)) {
    return null;
  }

  return {
    dayOfWeek: dayMap[day],
    hourLocal: bucketMap[bucket]
  };
}
