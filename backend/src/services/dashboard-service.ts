import { type PrismaClient, Platform } from "@prisma/client";
import { format, startOfDay, subDays } from "date-fns";

import { hasYouTubeAnalyticsScope } from "../adapters/youtube-adapter.js";
import { summarizeCreatorProfile } from "./learning-service.js";
import { getFreshnessMinutes } from "../lib/youtube-freshness.js";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(workspaceId: string) {
    const now = new Date();
    const fromDay = startOfDay(subDays(now, 6));

    const [
      assetCount,
      axoraPublishedPosts,
      pendingReview,
      latestReport,
      platformMixRaw,
      quotaLedgers,
      storageUsedRaw,
      youtubeAccount,
      latestChannelSnapshot,
      channelSeriesPoints,
      publishedPosts,
      competitorChannels
    ] = await Promise.all([
      this.prisma.asset.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
      this.prisma.platformPost.count({ where: { workspaceId, status: "PUBLISHED", asset: { status: { not: "ARCHIVED" } } } }),
      this.prisma.asset.count({ where: { workspaceId, status: "PENDING_REVIEW" } }),
      this.prisma.opportunityReport.findFirst({
        where: { workspaceId },
        orderBy: { generatedAt: "desc" }
      }),
      this.prisma.platformPost.groupBy({
        by: ["platform"],
        where: { workspaceId, status: "PUBLISHED", asset: { status: { not: "ARCHIVED" } } },
        _count: { _all: true }
      }),
      this.prisma.platformQuotaLedger.findMany({
        where: { workspaceId, platform: Platform.YOUTUBE },
        orderBy: { quotaDate: "desc" },
        take: 1
      }),
      this.prisma.assetFile.aggregate({
        where: { asset: { workspaceId } },
        _sum: { fileSizeBytes: true }
      }),
      this.prisma.connectedAccount.findFirst({
        where: { workspaceId, platform: Platform.YOUTUBE },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.youtubeChannelSnapshot.findFirst({
        where: { workspaceId },
        include: { channel: true },
        orderBy: { capturedAt: "desc" }
      }),
      this.prisma.youtubeChannelSeriesPoint.findMany({
        where: {
          workspaceId,
          granularity: "DAY",
          bucketStart: { gte: fromDay }
        },
        orderBy: { bucketStart: "asc" }
      }),
      this.prisma.platformPost.findMany({
        where: { workspaceId, status: "PUBLISHED", asset: { status: { not: "ARCHIVED" } } },
        select: {
          id: true,
          lastPolledAt: true,
          nextPollAt: true,
          metrics: true
        }
      }),
      this.prisma.competitorChannel.findMany({
        where: { workspaceId, platform: Platform.YOUTUBE },
        orderBy: { lastSyncedAt: "desc" }
      })
    ]);

    const performanceMap = new Map<string, { day: string; date: string; views: number; likes: number; comments: number; engagement: number; watchTimeMinutes: number }>();
    for (let index = 6; index >= 0; index -= 1) {
      const day = subDays(now, index);
      const key = format(day, "yyyy-MM-dd");
      performanceMap.set(key, {
        day: format(day, "EEE"),
        date: key,
        views: 0,
        likes: 0,
        comments: 0,
        engagement: 0,
        watchTimeMinutes: 0
      });
    }

    for (const point of channelSeriesPoints) {
      const key = format(point.bucketStart, "yyyy-MM-dd");
      const target = performanceMap.get(key);
      if (!target) continue;
      target.views += point.views;
      target.likes += point.likes ?? 0;
      target.comments += point.comments ?? 0;
      target.engagement += (point.likes ?? 0) + (point.comments ?? 0);
      target.watchTimeMinutes += point.watchTimeMinutes ?? 0;
    }

    const performanceHistory = [...performanceMap.values()];
    const totalPublished = platformMixRaw.reduce((sum, row) => sum + row._count._all, 0);
    const platformColors: Record<string, string> = {
      YOUTUBE: "#ef4444",
      INSTAGRAM: "#ec4899",
      TIKTOK: "#06b6d4",
      LINKEDIN: "#2563eb",
      X: "#71717a"
    };

    const platformMix = platformMixRaw.map((row) => ({
      name: row.platform,
      value: totalPublished > 0 ? Math.round((row._count._all / totalPublished) * 100) : 0,
      color: platformColors[row.platform] ?? "#71717a"
    }));

    const youtubeQuota = quotaLedgers[0];
    const storageBytes = storageUsedRaw._sum.fileSizeBytes ?? 0;
    const storageGB = Number((storageBytes / (1024 * 1024 * 1024)).toFixed(2));
    const axoraManagedViews = publishedPosts.reduce((sum, post) => sum + getMetricValue(post.metrics, "views"), 0);
    const axoraManagedLikes = publishedPosts.reduce((sum, post) => sum + getMetricValue(post.metrics, "likes"), 0);
    const axoraManagedComments = publishedPosts.reduce((sum, post) => sum + getMetricValue(post.metrics, "comments"), 0);
    const latestPostFreshness = minNumber(
      publishedPosts.map((post) => getFreshnessMinutes(post.lastPolledAt ?? null, now)).filter(isNumber)
    );
    const competitorFreshness = minNumber(
      competitorChannels.map((channel) => getFreshnessMinutes(channel.lastSyncedAt, now)).filter(isNumber)
    );
    const channelFreshness = getFreshnessMinutes(latestChannelSnapshot?.capturedAt ?? null, now);
    const reconnectRequired = Boolean(
      youtubeAccount && !hasYouTubeAnalyticsScope(youtubeAccount.scopes)
    );

    const systemHealth = [
      {
        label: "YouTube Quota",
        used: youtubeQuota ? (youtubeQuota.usedUnits + youtubeQuota.reservedUnits).toLocaleString() : "0",
        total: youtubeQuota ? youtubeQuota.dailyLimit.toLocaleString() : "10,000",
        pct: youtubeQuota ? Math.min(100, Math.round(((youtubeQuota.usedUnits + youtubeQuota.reservedUnits) / youtubeQuota.dailyLimit) * 100)) : 0,
        color: "#ef4444"
      },
      {
        label: "Storage Used",
        used: `${storageGB} GB`,
        total: "10 GB",
        pct: Math.min(100, Math.round((storageGB / 10) * 100)),
        color: "#8b5cf6"
      },
      {
        label: "AI Credits",
        used: "128",
        total: "1,000",
        pct: 12,
        color: "#06b6d4"
      }
    ];

    return {
      assets: assetCount,
      publishedPosts: axoraPublishedPosts,
      pendingReview,
      latestOpportunityReportAt: latestReport?.generatedAt ?? null,
      channelTotals: {
        totalVideos: latestChannelSnapshot?.totalVideos ?? 0,
        totalViews: latestChannelSnapshot?.totalViews ?? 0,
        subscriberCount: latestChannelSnapshot?.totalSubscribers ?? null,
        channelViewsRecentWindow: latestChannelSnapshot?.recentViews ?? null
      },
      axoraTotals: {
        axoraPublishedPosts,
        axoraManagedViews,
        axoraManagedLikes,
        axoraManagedComments
      },
      performanceHistory,
      platformMix,
      systemHealth,
      freshness: {
        channelAnalyticsMinutes: channelFreshness,
        axoraMetricsMinutes: latestPostFreshness,
        competitorMinutes: competitorFreshness
      },
      partialFlags: {
        youtubeReconnectRequired: reconnectRequired,
        channelAnalyticsAvailable: Boolean(latestChannelSnapshot?.recentViews !== null && latestChannelSnapshot?.recentViews !== undefined),
        competitorWarmup: competitorChannels.length === 0 || competitorFreshness === null,
        metricsSyncing: publishedPosts.some((post) => !post.lastPolledAt || post.nextPollAt !== null)
      }
    };
  }

  async listPosts(workspaceId: string) {
    const now = new Date();
    const posts = await this.prisma.platformPost.findMany({
      where: { workspaceId, asset: { status: { not: "ARCHIVED" } } },
      include: {
        asset: true,
        decision: {
          include: {
            metadataVariant: true,
            campaignWave: true
          }
        },
        connectedAccount: true
      },
      orderBy: { createdAt: "desc" }
    });

    return posts.map((post) => ({
      ...post,
      metrics: (post.metrics as Record<string, unknown> | null) ?? null,
      metricsFreshnessMinutes: getFreshnessMinutes(post.lastPolledAt ?? post.publishedAt ?? null, now)
    }));
  }

  async listAssets(workspaceId: string) {
    const [assets, channelTrends, youtubeVideos] = await Promise.all([
      this.prisma.asset.findMany({
        where: { workspaceId, status: { not: "ARCHIVED" } },
        include: {
          tags: true,
          metadataVariants: true,
          campaigns: {
            include: {
              waves: {
                include: {
                  decisions: {
                    include: {
                      post: {
                        include: {
                          snapshots: {
                            orderBy: { capturedAt: "desc" },
                            take: 1
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.channelTrendWindow.findMany({
        where: { workspaceId, windowDays: 30 },
        include: { channel: true },
        orderBy: { computedAt: "desc" }
      }),
      this.prisma.youtubeVideo.findMany({
        where: { workspaceId },
        orderBy: { publishedAt: "desc" },
        take: 500
      })
    ]);

    const trendByChannelId = new Map<string, (typeof channelTrends)[number]>();
    for (const trend of channelTrends) {
      if (!trendByChannelId.has(trend.channelId)) trendByChannelId.set(trend.channelId, trend);
    }

    const youtubeVideoByExternalId = new Map(youtubeVideos.map((video) => [video.externalVideoId, video] as const));

    return assets.map((asset) => {
      const decisions = asset.campaigns.flatMap((campaign) => campaign.waves).flatMap((wave) => wave.decisions);
      const youtubeDecision = decisions.find((decision) => decision.platform === "YOUTUBE" && decision.post?.externalPostId);
      const linkedVideo = youtubeDecision?.post?.externalPostId
        ? youtubeVideoByExternalId.get(youtubeDecision.post.externalPostId)
        : undefined;
      const trend = linkedVideo ? trendByChannelId.get(linkedVideo.channelId) : undefined;
      const freshnessAt = decisions
        .map((decision) => decision.post?.lastPolledAt ?? null)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const totalViews = decisions.reduce((sum, decision) => sum + getMetricValue(decision.post?.metrics ?? null, "views"), 0);

      return {
        ...asset,
        totalViews,
        metricsFreshnessMinutes: getFreshnessMinutes(freshnessAt, new Date()),
        assetIntelligence: asset.intelligence,
        youtubeContext: linkedVideo
          ? {
              externalVideoId: linkedVideo.externalVideoId,
              genreHint: linkedVideo.genreHint,
              channelId: linkedVideo.channelId,
              channelTrend: trend
                ? {
                    avgViews30d: trend.avgViews,
                    medianViews30d: trend.medianViews,
                    confidence: trend.confidence,
                    computedAt: trend.computedAt,
                    publishingWindows: trend.publishingWindows
                  }
                : null
            }
          : null,
        freshnessAt
      };
    });
  }

  async getIntelligenceOverview(workspaceId: string) {
    const now = new Date();
    const [youtubeAccount, creator, latestChannelSnapshot, latestTrendWindow, topPosts, competitorChannels, competitorVideos, weeklyReport] =
      await Promise.all([
        this.prisma.connectedAccount.findFirst({
          where: { workspaceId, platform: Platform.YOUTUBE },
          orderBy: { createdAt: "asc" }
        }),
        this.prisma.creator.findFirst({
          where: { workspaceId },
          include: { learningProfile: true },
          orderBy: { createdAt: "asc" }
        }),
        this.prisma.youtubeChannelSnapshot.findFirst({
          where: { workspaceId },
          orderBy: { capturedAt: "desc" }
        }),
        this.prisma.channelTrendWindow.findFirst({
          where: { workspaceId, windowDays: 30 },
          orderBy: { computedAt: "desc" }
        }),
        this.prisma.platformPost.findMany({
          where: { workspaceId, status: "PUBLISHED", asset: { status: { not: "ARCHIVED" } } },
          include: {
            asset: true,
            decision: true
          },
          orderBy: { publishedAt: "desc" },
          take: 20
        }),
        this.prisma.competitorChannel.findMany({
          where: { workspaceId, platform: Platform.YOUTUBE },
          include: {
            observations: {
              orderBy: { observedAt: "desc" },
              take: 1
            }
          },
          orderBy: { lastSyncedAt: "desc" }
        }),
        this.prisma.competitorVideo.findMany({
          where: { workspaceId },
          orderBy: { publishedAt: "desc" },
          take: 100
        }),
        this.prisma.opportunityReport.findFirst({
          where: { workspaceId },
          orderBy: { generatedAt: "desc" }
        })
      ]);

    const topMovers = topPosts
      .map((post) => ({
        id: post.id,
        assetId: post.assetId,
        title: post.asset.title,
        views: getMetricValue(post.metrics, "views"),
        likes: getMetricValue(post.metrics, "likes"),
        comments: getMetricValue(post.metrics, "comments"),
        publishedAt: post.publishedAt,
        freshnessMinutes: getFreshnessMinutes(post.lastPolledAt ?? post.publishedAt ?? null, now)
      }))
      .sort((left, right) => right.views - left.views)
      .slice(0, 5);

    const underperformers = topPosts
      .filter((post) => post.publishedAt && now.getTime() - post.publishedAt.getTime() >= 24 * 60 * 60 * 1000)
      .map((post) => {
        const views = getMetricValue(post.metrics, "views");
        const baselineViews = typeof post.decision?.predictedViews === "number" ? post.decision.predictedViews : 0;
        const action =
          now.getTime() - (post.publishedAt?.getTime() ?? now.getTime()) >= 72 * 60 * 60 * 1000 &&
          baselineViews > 0 &&
          views < baselineViews * 0.25
            ? "archive"
            : baselineViews > 0 && views < baselineViews * 0.5
              ? "regenerate_metadata"
              : "hold";

        return {
          id: post.id,
          assetId: post.assetId,
          title: post.asset.title,
          views,
          baselineViews,
          recommendedAction: action,
          publishedAt: post.publishedAt
        };
      })
      .filter((item) => item.recommendedAction !== "hold")
      .slice(0, 5);

    const formatSplit = buildFormatSplit(topPosts.map((post) => post.decision?.format ?? "UNKNOWN"));
    const competitors = competitorChannels.map((channel) => {
      const videos = competitorVideos.filter((video) => video.competitorChannelId === channel.id);
      const latestObservation = channel.observations[0];
      return {
        id: channel.id,
        name: channel.name,
        subscriberCount: channel.subscriberCount,
        totalVideos: channel.videoCount,
        avgViews: Math.round(average(videos.map((video) => video.views))),
        postingWindow: latestObservation?.postingWindow ?? "unknown",
        topicKeywords: normalizeStringArray(channel.topicKeywords).slice(0, 5),
        trend:
          average(videos.slice(0, 3).map((video) => video.velocityPerHour ?? 0)) > 0
            ? "up"
            : "flat",
        freshnessMinutes: getFreshnessMinutes(channel.lastSyncedAt, now)
      };
    });

    const competitorOpportunities = buildCompetitorOpportunities(competitorChannels, competitorVideos, latestTrendWindow, now);
    const reconnectRequired = Boolean(youtubeAccount && !hasYouTubeAnalyticsScope(youtubeAccount.scopes));

    return {
      channel: {
        connected: Boolean(youtubeAccount),
        reconnectRequired,
        analyticsEnabled: Boolean(youtubeAccount && hasYouTubeAnalyticsScope(youtubeAccount.scopes)),
        freshnessMinutes: getFreshnessMinutes(latestChannelSnapshot?.capturedAt ?? null, now),
        totals: latestChannelSnapshot
          ? {
              totalViews: latestChannelSnapshot.totalViews,
              totalSubscribers: latestChannelSnapshot.totalSubscribers,
              totalVideos: latestChannelSnapshot.totalVideos,
              recentViews: latestChannelSnapshot.recentViews
            }
          : null,
        bestPublishingWindows: latestTrendWindow?.publishingWindows ?? null,
        topMovers,
        formatSplit,
        underperformers
      },
      competitors: {
        freshnessMinutes: minNumber(competitors.map((item) => item.freshnessMinutes).filter(isNumber)),
        warmup: competitors.length === 0,
        channels: competitors,
        opportunities: competitorOpportunities
      },
      creatorProfile: summarizeCreatorProfile(creator?.learningProfile ?? null),
      weeklyBrief: weeklyReport
        ? {
            generatedAt: weeklyReport.generatedAt,
            status: weeklyReport.status
          }
        : null,
      partialFlags: {
        youtubeReconnectRequired: reconnectRequired,
        competitorWarmup: competitors.length === 0
      }
    };
  }

  async latestOpportunityReport(workspaceId: string) {
    return this.prisma.opportunityReport.findFirst({
      where: { workspaceId },
      orderBy: { generatedAt: "desc" }
    });
  }

  async getAccountHealth(workspaceId: string) {
    return this.prisma.connectedAccount.findMany({
      where: { workspaceId },
      include: {
        healthEvents: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }
}

function getMetricValue(metrics: unknown, key: "views" | "likes" | "comments") {
  if (!metrics || typeof metrics !== "object") return 0;
  const value = (metrics as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

function buildFormatSplit(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function buildCompetitorOpportunities(
  channels: Array<{ observations: Array<{ postingWindow: string; topicKeywords: unknown; rawMetrics: unknown }> }>,
  videos: Array<{ publishedAt: Date; views: number; title: string; competitorChannelId: string; lastSyncedAt: Date | null }>,
  latestTrendWindow: { publishingWindows: unknown } | null,
  now: Date
) {
  const opportunities: Array<Record<string, unknown>> = [];
  const ownWindows = normalizeBucketMap(latestTrendWindow?.publishingWindows);
  const competitorWindows = new Map<string, number>();
  const windowKeys: Array<keyof ReturnType<typeof normalizeBucketMap>> = [
    "morning",
    "afternoon",
    "evening",
    "night"
  ];

  for (const channel of channels) {
    const window = channel.observations[0]?.postingWindow;
    if (!window) continue;
    competitorWindows.set(window, (competitorWindows.get(window) ?? 0) + 1);
  }

  const quietWindow = windowKeys
    .map((window) => ({
      window,
      own: ownWindows[window] ?? 0,
      competitors: competitorWindows.get(window) ?? 0
    }))
    .sort((left, right) => (left.competitors - left.own) - (right.competitors - right.own))[0];

  if (quietWindow) {
    opportunities.push({
      type: "Timing",
      title: `Whitespace window: ${quietWindow.window}`,
      description: "Competitors are posting less often here than your current historical pattern.",
      action: `Test the next publish in the ${quietWindow.window} window.`,
      confidence: 0.62,
      sourceFreshnessMinutes: minNumber(videos.map((video) => getFreshnessMinutes(video.lastSyncedAt, now)).filter(isNumber))
    });
  }

  const fastestVideo = [...videos].sort((left, right) => right.views - left.views)[0];
  if (fastestVideo) {
    opportunities.push({
      type: "Topic",
      title: `Competitor topic moving now`,
      description: fastestVideo.title,
      action: "Build a response or adjacent angle while the topic is still warm.",
      confidence: 0.58,
      sourceFreshnessMinutes: getFreshnessMinutes(fastestVideo.lastSyncedAt, now)
    });
  }

  return opportunities;
}

function normalizeBucketMap(value: unknown) {
  if (!value || typeof value !== "object") {
    return { morning: 0, afternoon: 0, evening: 0, night: 0 };
  }

  const candidate = value as Record<string, unknown>;
  return {
    morning: typeof candidate.morning === "number" ? candidate.morning : 0,
    afternoon: typeof candidate.afternoon === "number" ? candidate.afternoon : 0,
    evening: typeof candidate.evening === "number" ? candidate.evening : 0,
    night: typeof candidate.night === "number" ? candidate.night : 0
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minNumber(values: number[]) {
  return values.length === 0 ? null : Math.min(...values);
}

function isNumber(value: number | null): value is number {
  return typeof value === "number";
}
