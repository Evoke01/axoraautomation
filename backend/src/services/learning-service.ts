import { toZonedTime } from "date-fns-tz";
import {
  Platform,
  PostStatus,
  type PerformanceCheckpointKey,
  type PrismaClient
} from "@prisma/client";

import type { YouTubeAdapter } from "../adapters/youtube-adapter.js";
import { env } from "../config/env.js";
import {
  getCheckpointDeadlineAt,
  getCheckpointRetryDelayMs,
  getCheckpointTargetAt
} from "../lib/youtube-learning.js";
import { NotFoundError } from "../lib/errors.js";

type LearningWeight = {
  key: string;
  avgCtr: number;
  ctrLift: number;
  avgScore: number;
  confidence: number;
  sampleSize: number;
  distinctPosts: number;
  autoApply: boolean;
};

type LearningSummary = {
  headline: string;
  synthesized: boolean;
  groqSummary: string | null;
  cohereSummary: string | null;
  recommendedPublishWindows: string[];
  bestPatterns: string[];
  avoidPatterns: string[];
  bestThumbnailStyles: string[];
  bestKeywords: string[];
  bestAngles: string[];
};

export type CreatorProfilePack = {
  bestTitlePatterns: string[];
  avoidTitlePatterns: string[];
  bestPublishWindows: string[];
  bestThumbnailStyles: string[];
  bestKeywords: string[];
  bestAngles: string[];
};

type LearningSample = {
  postId: string;
  title: string;
  thumbnailBrief: string;
  keywords: string[];
  hashtags: string[];
  angle: string;
  publishedAt: Date;
  ctr: number;
  impressions: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  compositeScore: number;
};

type CaptureCheckpointResult =
  | { status: "captured"; creatorId: string; checkpointId: string }
  | { status: "retry"; delayMs: number }
  | { status: "stale" }
  | { status: "skipped" };

type LearningProfileRecord = {
  titlePatternWeights: unknown;
  publishTimeWeights: unknown;
  thumbnailStyleWeights: unknown;
  keywordWeights: unknown;
  angleWeights: unknown;
  summary?: unknown;
  sampleSize?: number;
  confidence?: number;
  lastLearnedAt?: Date | null;
} | null;

const CHECKPOINT_PRIORITY: Record<PerformanceCheckpointKey, number> = {
  H24: 1,
  H72: 2,
  D7: 3,
  D30: 4
};

const TITLE_PATTERN_LABELS: Record<string, string> = {
  question: "Question titles",
  number_led: "Number-led titles",
  authority: "Authority framing",
  curiosity: "Curiosity hooks",
  contrarian: "Contrarian titles",
  short: "Short titles",
  medium: "Medium titles",
  long: "Long titles"
};

const THUMBNAIL_STYLE_LABELS: Record<string, string> = {
  bold_text: "Bold text thumbnails",
  proof_point: "Proof-point thumbnails",
  curiosity_tease: "Curiosity thumbnails",
  contrast_claim: "Contrast thumbnails",
  data_visual: "Data-driven thumbnails",
  face_reaction: "Face/reaction thumbnails",
  clean_simple: "Clean/simple thumbnails"
};

const ANGLE_LABELS: Record<string, string> = {
  curiosity: "Curiosity angle",
  authority: "Authority angle",
  controversy: "Controversy angle"
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class LearningService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly youtube: YouTubeAdapter
  ) {}

  async captureCheckpoint(postId: string, checkpointKey: PerformanceCheckpointKey): Promise<CaptureCheckpointResult> {
    const post = await this.prisma.platformPost.findUnique({
      where: { id: postId },
      include: {
        asset: {
          select: {
            creatorId: true
          }
        }
      }
    });

    if (
      !post ||
      post.platform !== Platform.YOUTUBE ||
      post.status !== PostStatus.PUBLISHED ||
      !post.connectedAccountId ||
      !post.externalPostId ||
      !post.publishedAt
    ) {
      return { status: "skipped" };
    }

    const existing = await this.prisma.postPerformanceCheckpoint.findUnique({
      where: {
        platformPostId_checkpointKey: {
          platformPostId: post.id,
          checkpointKey
        }
      }
    });

    if (existing?.status === "CAPTURED" || existing?.status === "STALE") {
      return { status: "skipped" };
    }

    const now = new Date();
    const targetAt = getCheckpointTargetAt(post.publishedAt, checkpointKey);
    const deadlineAt = getCheckpointDeadlineAt(post.publishedAt, checkpointKey);
    const metrics = await this.youtube
      .getVideoLearningMetrics(post.connectedAccountId, post.externalPostId, checkpointKey)
      .catch(() => null);

    if (!metrics) {
      if (now < deadlineAt) {
        return {
          status: "retry",
          delayMs: getCheckpointRetryDelayMs(targetAt, now)
        };
      }

      await this.prisma.postPerformanceCheckpoint.upsert({
        where: {
          platformPostId_checkpointKey: {
            platformPostId: post.id,
            checkpointKey
          }
        },
        update: {
          status: "STALE",
          capturedAt: now,
          rawMetrics: {
            reason: "analytics_not_ready",
            checkpointKey
          } as any
        },
        create: {
          platformPostId: post.id,
          checkpointKey,
          status: "STALE",
          capturedAt: now,
          rawMetrics: {
            reason: "analytics_not_ready",
            checkpointKey
          } as any
        }
      });

      return { status: "stale" };
    }

    const checkpoint = await this.prisma.postPerformanceCheckpoint.upsert({
      where: {
        platformPostId_checkpointKey: {
          platformPostId: post.id,
          checkpointKey
        }
      },
      update: {
        status: "CAPTURED",
        capturedAt: now,
        views: metrics.views,
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        estimatedMinutesWatched: metrics.estimatedMinutesWatched,
        averageViewDuration: metrics.averageViewDuration,
        averageViewPercentage: metrics.averageViewPercentage,
        rawMetrics: metrics.rawMetrics as any
      },
      create: {
        platformPostId: post.id,
        checkpointKey,
        status: "CAPTURED",
        capturedAt: now,
        views: metrics.views,
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        estimatedMinutesWatched: metrics.estimatedMinutesWatched,
        averageViewDuration: metrics.averageViewDuration,
        averageViewPercentage: metrics.averageViewPercentage,
        rawMetrics: metrics.rawMetrics as any
      }
    });

    return {
      status: "captured",
      creatorId: post.asset.creatorId,
      checkpointId: checkpoint.id
    };
  }

  async recomputeCreatorProfile(
    creatorId: string,
    options: { triggerCheckpointKey?: PerformanceCheckpointKey | null } = {}
  ) {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
      include: {
        workspace: true,
        learningProfile: true
      }
    });

    if (!creator) {
      throw new NotFoundError("Creator was not found.");
    }

    const posts = await this.prisma.platformPost.findMany({
      where: {
        platform: Platform.YOUTUBE,
        status: PostStatus.PUBLISHED,
        asset: {
          creatorId
        }
      },
      include: {
        asset: {
          select: {
            title: true
          }
        },
        decision: {
          include: {
            metadataVariant: true
          }
        },
        performanceCheckpoints: {
          where: { status: "CAPTURED" },
          orderBy: { capturedAt: "desc" }
        }
      }
    });

    const totalCheckpointCount = posts.reduce((sum, post) => sum + post.performanceCheckpoints.length, 0);
    const distinctPostsWithCheckpoints = posts.filter((post) => post.performanceCheckpoints.length > 0).length;
    const samples = posts
      .map((post) => buildLearningSample(post))
      .filter((sample): sample is LearningSample => Boolean(sample));

    const baselineCtr = average(samples.map((sample) => sample.ctr));
    const baselineScore = average(samples.map((sample) => sample.compositeScore));
    const titlePatternWeights = buildFeatureWeights(
      samples,
      (sample) => extractTitlePatterns(sample.title),
      baselineCtr,
      baselineScore,
      totalCheckpointCount,
      distinctPostsWithCheckpoints
    );
    const publishTimeWeights = buildFeatureWeights(
      samples,
      (sample) => [buildPublishWindowKey(sample.publishedAt, creator.workspace.timezone)],
      baselineCtr,
      baselineScore,
      totalCheckpointCount,
      distinctPostsWithCheckpoints
    );
    const thumbnailStyleWeights = buildFeatureWeights(
      samples,
      (sample) => deriveThumbnailStyles(sample.thumbnailBrief),
      baselineCtr,
      baselineScore,
      totalCheckpointCount,
      distinctPostsWithCheckpoints
    );
    const keywordWeights = buildFeatureWeights(
      samples,
      (sample) => normalizeKeywordPool([...sample.keywords, ...sample.hashtags]).slice(0, 6),
      baselineCtr,
      baselineScore,
      totalCheckpointCount,
      distinctPostsWithCheckpoints
    );
    const angleWeights = buildFeatureWeights(
      samples,
      (sample) => [sample.angle || "unknown"],
      baselineCtr,
      baselineScore,
      totalCheckpointCount,
      distinctPostsWithCheckpoints
    );

    const overallConfidence = clamp(
      0,
      0.99,
      (Math.min(totalCheckpointCount, 12) / 12) * 0.55 +
        (Math.min(distinctPostsWithCheckpoints, 6) / 6) * 0.45
    );

    const shouldSynthesize =
      totalCheckpointCount > 0 &&
      (options.triggerCheckpointKey === "D7" ||
        options.triggerCheckpointKey === "D30" ||
        totalCheckpointCount - (creator.learningProfile?.lastSynthesizedCheckpointCount ?? 0) >= 3);

    const summary = await this.buildSummary(
      {
        titlePatternWeights,
        publishTimeWeights,
        thumbnailStyleWeights,
        keywordWeights,
        angleWeights
      },
      shouldSynthesize
    );

    const now = new Date();
    return this.prisma.creatorLearningProfile.upsert({
      where: { creatorId },
      update: {
        titlePatternWeights: titlePatternWeights as any,
        publishTimeWeights: publishTimeWeights as any,
        thumbnailStyleWeights: thumbnailStyleWeights as any,
        keywordWeights: keywordWeights as any,
        angleWeights: angleWeights as any,
        sampleSize: totalCheckpointCount,
        confidence: Number(overallConfidence.toFixed(2)),
        lastLearnedAt: now,
        lastSynthesizedAt: shouldSynthesize ? now : creator.learningProfile?.lastSynthesizedAt ?? null,
        lastSynthesizedCheckpointCount: shouldSynthesize
          ? totalCheckpointCount
          : creator.learningProfile?.lastSynthesizedCheckpointCount ?? 0,
        summary: summary as any
      },
      create: {
        creatorId,
        titlePatternWeights: titlePatternWeights as any,
        publishTimeWeights: publishTimeWeights as any,
        thumbnailStyleWeights: thumbnailStyleWeights as any,
        keywordWeights: keywordWeights as any,
        angleWeights: angleWeights as any,
        sampleSize: totalCheckpointCount,
        confidence: Number(overallConfidence.toFixed(2)),
        lastLearnedAt: now,
        lastSynthesizedAt: shouldSynthesize ? now : null,
        lastSynthesizedCheckpointCount: shouldSynthesize ? totalCheckpointCount : 0,
        summary: summary as any
      }
    });
  }

  private async buildSummary(
    weights: {
      titlePatternWeights: LearningWeight[];
      publishTimeWeights: LearningWeight[];
      thumbnailStyleWeights: LearningWeight[];
      keywordWeights: LearningWeight[];
      angleWeights: LearningWeight[];
    },
    shouldSynthesize: boolean
  ): Promise<LearningSummary> {
    const bestPatterns = weights.titlePatternWeights.filter((item) => item.ctrLift >= 0).slice(0, 3).map((item) => item.key);
    const avoidPatterns = [...weights.titlePatternWeights]
      .filter((item) => item.ctrLift < 0)
      .sort((left, right) => left.ctrLift - right.ctrLift)
      .slice(0, 2)
      .map((item) => item.key);
    const recommendedPublishWindows = weights.publishTimeWeights
      .filter((item) => item.ctrLift >= 0)
      .slice(0, 3)
      .map((item) => item.key);
    const bestThumbnailStyles = weights.thumbnailStyleWeights.filter((item) => item.ctrLift >= 0).slice(0, 2).map((item) => item.key);
    const bestKeywords = weights.keywordWeights.filter((item) => item.ctrLift >= 0).slice(0, 3).map((item) => item.key);
    const bestAngles = weights.angleWeights.filter((item) => item.ctrLift >= 0).slice(0, 2).map((item) => item.key);

    let groqSummary: string | null = null;
    let cohereSummary: string | null = null;
    let synthesizedWindows = recommendedPublishWindows;

    if (shouldSynthesize) {
      [groqSummary, synthesizedWindows, cohereSummary] = await Promise.all([
        this.summarizePatternsWithGroq({
          bestPatterns,
          avoidPatterns,
          bestThumbnailStyles,
          bestKeywords,
          bestAngles
        }),
        this.rankWindowsWithCohere(weights.publishTimeWeights),
        this.summarizeWindowsWithCohere(weights.publishTimeWeights)
      ]);
    }

    const headline =
      groqSummary ??
      buildHeuristicHeadline(bestPatterns[0] ?? null, synthesizedWindows[0] ?? null, bestAngles[0] ?? null);

    return {
      headline,
      synthesized: shouldSynthesize,
      groqSummary,
      cohereSummary,
      recommendedPublishWindows: synthesizedWindows,
      bestPatterns,
      avoidPatterns,
      bestThumbnailStyles,
      bestKeywords,
      bestAngles
    };
  }

  private async summarizePatternsWithGroq(input: {
    bestPatterns: string[];
    avoidPatterns: string[];
    bestThumbnailStyles: string[];
    bestKeywords: string[];
    bestAngles: string[];
  }) {
    if (!env.GROQ_API_KEY) {
      return null;
    }

    try {
      const response = await fetch(`${env.GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 90,
          messages: [
            {
              role: "system",
              content: "Summarize creator-specific YouTube winners in one sentence. Be concrete and short."
            },
            {
              role: "user",
              content: JSON.stringify({
                win_titles: input.bestPatterns,
                avoid_titles: input.avoidPatterns,
                thumbs: input.bestThumbnailStyles,
                keywords: input.bestKeywords,
                angles: input.bestAngles
              })
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Groq ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      return content ? clipText(content, 180) : null;
    } catch {
      return null;
    }
  }

  private async rankWindowsWithCohere(weights: LearningWeight[]) {
    const candidates = weights.filter((item) => item.ctrLift >= 0).slice(0, 5).map((item) => ({
      key: item.key,
      ctrLift: Number(item.ctrLift.toFixed(4)),
      confidence: item.confidence
    }));

    if (candidates.length === 0) {
      return [];
    }

    if (!env.COHERE_API_KEY) {
      return candidates.slice(0, 3).map((item) => item.key);
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
              content: 'Rank creator-specific publish windows. Return JSON only: {"top":["key1","key2","key3"],"r":"short reason"}'
            },
            {
              role: "user",
              content: JSON.stringify({ windows: candidates })
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
      const top = Array.isArray(parsed?.top)
        ? parsed.top.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 3)
        : [];
      return top.length > 0 ? top : candidates.slice(0, 3).map((item) => item.key);
    } catch {
      return candidates.slice(0, 3).map((item) => item.key);
    }
  }

  private async summarizeWindowsWithCohere(weights: LearningWeight[]) {
    const candidates = weights.filter((item) => item.ctrLift >= 0).slice(0, 3).map((item) => ({
      key: item.key,
      ctrLift: Number(item.ctrLift.toFixed(4))
    }));

    if (candidates.length === 0 || !env.COHERE_API_KEY) {
      return null;
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
              content: "Summarize the best publish window insight in one short sentence."
            },
            {
              role: "user",
              content: JSON.stringify({ windows: candidates })
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
      const content = payload.message?.content?.[0]?.text?.trim();
      return content ? clipText(content, 140) : null;
    } catch {
      return null;
    }
  }
}

export function buildCreatorProfilePack(profile: LearningProfileRecord): CreatorProfilePack {
  const titleWeights = normalizeWeights(profile?.titlePatternWeights);
  const publishTimeWeights = normalizeWeights(profile?.publishTimeWeights);
  const thumbnailStyleWeights = normalizeWeights(profile?.thumbnailStyleWeights);
  const keywordWeights = normalizeWeights(profile?.keywordWeights);
  const angleWeights = normalizeWeights(profile?.angleWeights);
  const summary = profile?.summary && typeof profile.summary === "object"
    ? (profile.summary as Record<string, unknown>)
    : null;

  const recommendedPublishWindows = normalizeStringArray(summary?.recommendedPublishWindows);

  return {
    bestTitlePatterns: titleWeights.filter((item) => item.autoApply && item.ctrLift >= 0).slice(0, 3).map((item) => item.key),
    avoidTitlePatterns: [...titleWeights]
      .filter((item) => item.autoApply && item.ctrLift < 0)
      .sort((left, right) => left.ctrLift - right.ctrLift)
      .slice(0, 2)
      .map((item) => item.key),
    bestPublishWindows:
      recommendedPublishWindows.length > 0
        ? recommendedPublishWindows.slice(0, 3)
        : publishTimeWeights.filter((item) => item.autoApply && item.ctrLift >= 0).slice(0, 3).map((item) => item.key),
    bestThumbnailStyles: thumbnailStyleWeights.filter((item) => item.autoApply && item.ctrLift >= 0).slice(0, 2).map((item) => item.key),
    bestKeywords: keywordWeights.filter((item) => item.autoApply && item.ctrLift >= 0).slice(0, 3).map((item) => item.key),
    bestAngles: angleWeights.filter((item) => item.autoApply && item.ctrLift >= 0).slice(0, 2).map((item) => item.key)
  };
}

export function summarizeCreatorProfile(profile: LearningProfileRecord) {
  const pack = buildCreatorProfilePack(profile);
  return {
    sampleSize: profile?.sampleSize ?? 0,
    confidence: typeof profile?.confidence === "number" ? profile.confidence : 0,
    bestTitlePatterns: pack.bestTitlePatterns.map((item) => humanizeTitlePattern(item)),
    avoidTitlePatterns: pack.avoidTitlePatterns.map((item) => humanizeTitlePattern(item)),
    bestPublishWindows: pack.bestPublishWindows.map((item) => humanizePublishWindow(item)),
    bestThumbnailStyles: pack.bestThumbnailStyles.map((item) => humanizeThumbnailStyle(item)),
    bestKeywords: pack.bestKeywords.map((item) => humanizeKeyword(item)),
    bestAngles: pack.bestAngles.map((item) => humanizeAngle(item)),
    lastLearnedAt: profile?.lastLearnedAt ?? null
  };
}

function buildLearningSample(
  post: {
    id: string;
    publishedAt: Date | null;
    asset: { title: string };
    decision: {
      metadataVariant: {
        title: string;
        thumbnailBrief: string;
        keywords: unknown;
        hashtags: unknown;
        angle: string | null;
      } | null;
    } | null;
    performanceCheckpoints: Array<{
      checkpointKey: PerformanceCheckpointKey;
      ctr: number | null;
      impressions: number | null;
      views: number | null;
      estimatedMinutesWatched: number | null;
      averageViewDuration: number | null;
      averageViewPercentage: number | null;
    }>;
  }
): LearningSample | null {
  if (!post.publishedAt || post.performanceCheckpoints.length === 0) {
    return null;
  }

  const checkpoint = [...post.performanceCheckpoints].sort(
    (left, right) => CHECKPOINT_PRIORITY[right.checkpointKey] - CHECKPOINT_PRIORITY[left.checkpointKey]
  )[0];

  if (!checkpoint) {
    return null;
  }

  const title = post.decision?.metadataVariant?.title ?? post.asset.title;
  const thumbnailBrief = post.decision?.metadataVariant?.thumbnailBrief ?? "";
  const keywords = normalizeStringArray(post.decision?.metadataVariant?.keywords);
  const hashtags = normalizeStringArray(post.decision?.metadataVariant?.hashtags);
  const angle = post.decision?.metadataVariant?.angle ?? "unknown";
  const ctr = checkpoint.ctr ?? 0;
  const impressions = checkpoint.impressions ?? 0;
  const estimatedMinutesWatched = checkpoint.estimatedMinutesWatched ?? 0;
  const averageViewDuration = checkpoint.averageViewDuration ?? 0;
  const averageViewPercentage = checkpoint.averageViewPercentage ?? 0;
  const compositeScore = Number(
    (
      ctr * 0.55 +
      clamp(0, 1, averageViewPercentage / 100) * 0.25 +
      clamp(0, 1, Math.log10(estimatedMinutesWatched + 1) / 4) * 0.1 +
      clamp(0, 1, Math.log10(impressions + 1) / 6) * 0.1
    ).toFixed(4)
  );

  return {
    postId: post.id,
    title,
    thumbnailBrief,
    keywords,
    hashtags,
    angle,
    publishedAt: post.publishedAt,
    ctr,
    impressions,
    estimatedMinutesWatched,
    averageViewDuration,
    averageViewPercentage,
    compositeScore
  };
}

function buildFeatureWeights(
  samples: LearningSample[],
  extractor: (sample: LearningSample) => string[],
  baselineCtr: number,
  baselineScore: number,
  totalCheckpointCount: number,
  distinctPostsAcrossCreator: number
) {
  const buckets = new Map<
    string,
    {
      postIds: Set<string>;
      ctrSum: number;
      scoreSum: number;
      count: number;
    }
  >();

  for (const sample of samples) {
    const keys = [...new Set(extractor(sample).filter(Boolean))];
    for (const key of keys) {
      const bucket = buckets.get(key) ?? {
        postIds: new Set<string>(),
        ctrSum: 0,
        scoreSum: 0,
        count: 0
      };
      bucket.postIds.add(sample.postId);
      bucket.ctrSum += sample.ctr;
      bucket.scoreSum += sample.compositeScore;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const avgCtr = bucket.count > 0 ? bucket.ctrSum / bucket.count : 0;
      const avgScore = bucket.count > 0 ? bucket.scoreSum / bucket.count : 0;
      const ctrLift = avgCtr - baselineCtr;
      const confidence = Number(
        clamp(
          0,
          0.99,
          0.2 +
            Math.min(bucket.count, 5) / 5 * 0.25 +
            Math.min(bucket.postIds.size, 4) / 4 * 0.25 +
            Math.min(Math.abs(ctrLift) / Math.max(baselineCtr || 0.01, 0.01), 1) * 0.3
        ).toFixed(2)
      );

      return {
        key,
        avgCtr: Number(avgCtr.toFixed(4)),
        ctrLift: Number(ctrLift.toFixed(4)),
        avgScore: Number((avgScore - baselineScore).toFixed(4)),
        confidence,
        sampleSize: bucket.count,
        distinctPosts: bucket.postIds.size,
        autoApply:
          totalCheckpointCount >= 5 &&
          distinctPostsAcrossCreator >= 3 &&
          confidence >= 0.6
      } satisfies LearningWeight;
    })
    .sort((left, right) => {
      if (right.ctrLift !== left.ctrLift) {
        return right.ctrLift - left.ctrLift;
      }
      return right.confidence - left.confidence;
    });
}

function extractTitlePatterns(title: string) {
  const normalized = title.trim().toLowerCase();
  const patterns = new Set<string>();

  if (normalized.includes("?")) patterns.add("question");
  if (/^\d/.test(normalized)) patterns.add("number_led");
  if (/\b(playbook|framework|guide|system|expert|strategy|exact|formula)\b/.test(normalized)) patterns.add("authority");
  if (/\b(why|secret|mistake|miss|hidden|truth|unexpected)\b/.test(normalized)) patterns.add("curiosity");
  if (/\b(wrong|stop|never|lie|overrated|don't)\b/.test(normalized)) patterns.add("contrarian");

  if (normalized.length <= 40) {
    patterns.add("short");
  } else if (normalized.length <= 60) {
    patterns.add("medium");
  } else {
    patterns.add("long");
  }

  return [...patterns];
}

function deriveThumbnailStyles(thumbnailBrief: string) {
  const normalized = thumbnailBrief.toLowerCase();
  const styles = new Set<string>();

  if (/\b(bold|statement|large text)\b/.test(normalized)) styles.add("bold_text");
  if (/\b(proof|expert|framework|proof point)\b/.test(normalized)) styles.add("proof_point");
  if (/\b(curiosity|promise|unresolved|secret)\b/.test(normalized)) styles.add("curiosity_tease");
  if (/\b(contrast|versus|vs|sharp contrast)\b/.test(normalized)) styles.add("contrast_claim");
  if (/\b(chart|graph|data|stat)\b/.test(normalized)) styles.add("data_visual");
  if (/\b(face|reaction|emotion)\b/.test(normalized)) styles.add("face_reaction");

  if (styles.size === 0) {
    styles.add("clean_simple");
  }

  return [...styles];
}

function buildPublishWindowKey(publishedAt: Date, timezone: string) {
  const zoned = toZonedTime(publishedAt, timezone);
  const day = DAY_LABELS[zoned.getDay()]?.toLowerCase() ?? "mon";
  const hour = zoned.getHours();
  const bucket =
    hour >= 6 && hour < 12
      ? "morning"
      : hour >= 12 && hour < 17
        ? "afternoon"
        : hour >= 17 && hour < 22
          ? "evening"
          : "night";

  return `${day}_${bucket}`;
}

function normalizeKeywordPool(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 2))];
}

function normalizeWeights(value: unknown): LearningWeight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is LearningWeight => Boolean(item) && typeof item === "object" && typeof (item as LearningWeight).key === "string")
    .map((item) => ({
      key: item.key,
      avgCtr: typeof item.avgCtr === "number" ? item.avgCtr : 0,
      ctrLift: typeof item.ctrLift === "number" ? item.ctrLift : 0,
      avgScore: typeof item.avgScore === "number" ? item.avgScore : 0,
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
      sampleSize: typeof item.sampleSize === "number" ? item.sampleSize : 0,
      distinctPosts: typeof item.distinctPosts === "number" ? item.distinctPosts : 0,
      autoApply: Boolean(item.autoApply)
    }))
    .sort((left, right) => right.ctrLift - left.ctrLift);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildHeuristicHeadline(bestPattern: string | null, bestWindow: string | null, bestAngle: string | null) {
  const parts = [
    bestPattern ? `${humanizeTitlePattern(bestPattern)} are winning` : null,
    bestWindow ? `${humanizePublishWindow(bestWindow)} is the strongest slot` : null,
    bestAngle ? `${humanizeAngle(bestAngle)} is compounding best` : null
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(". ") : "Learning profile is still warming up.";
}

function humanizeTitlePattern(value: string) {
  return TITLE_PATTERN_LABELS[value] ?? value.replace(/_/g, " ");
}

function humanizeThumbnailStyle(value: string) {
  return THUMBNAIL_STYLE_LABELS[value] ?? value.replace(/_/g, " ");
}

function humanizeAngle(value: string) {
  return ANGLE_LABELS[value] ?? value.replace(/_/g, " ");
}

function humanizeKeyword(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function humanizePublishWindow(value: string) {
  const [day, bucket] = value.split("_");
  const dayLabel = day ? day[0]?.toUpperCase() + day.slice(1, 3) : "Day";
  const bucketLabel = bucket ? bucket[0]?.toUpperCase() + bucket.slice(1) : "Window";
  return `${dayLabel} ${bucketLabel}`;
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 1).trim();
}

function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value));
}

function safeJsonParse(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}
