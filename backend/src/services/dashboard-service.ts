import { type PrismaClient, Platform } from "@prisma/client";
import { startOfDay, subDays, format } from "date-fns";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(workspaceId: string) {
    const now = new Date();
    const sevenDaysAgo = startOfDay(subDays(now, 7));

    const [
      assetCount,
      publishedCount,
      pendingCount,
      latestReport,
      platformMixRaw,
      recentSnapshots,
      quotaLedgers,
      storageUsedRaw
    ] = await Promise.all([
      this.prisma.asset.count({ where: { workspaceId } }),
      this.prisma.platformPost.count({ where: { workspaceId, status: "PUBLISHED" } }),
      this.prisma.asset.count({ where: { workspaceId, status: "PENDING_REVIEW" } }),
      this.prisma.opportunityReport.findFirst({
        where: { workspaceId },
        orderBy: { generatedAt: "desc" }
      }),
      this.prisma.platformPost.groupBy({
        by: ["platform"],
        where: { workspaceId, status: "PUBLISHED" },
        _count: { _all: true }
      }),
      this.prisma.postMetricsSnapshot.findMany({
        where: {
          platformPost: { workspaceId },
          capturedAt: { gte: sevenDaysAgo }
        },
        orderBy: { capturedAt: "asc" }
      }),
      this.prisma.platformQuotaLedger.findMany({
        where: { workspaceId, platform: Platform.YOUTUBE },
        orderBy: { quotaDate: "desc" },
        take: 1
      }),
      this.prisma.assetFile.aggregate({
        where: { asset: { workspaceId } },
        _sum: { fileSizeBytes: true }
      })
    ]);

    // 1. Performance History (Last 7 Days)
    const perfMap = new Map<string, { views: number; engagement: number }>();
    for (let i = 0; i <= 7; i++) {
      const d = format(subDays(now, i), "EEE"); // "Mon", "Tue"...
      perfMap.set(d, { views: 0, engagement: 0 });
    }

    recentSnapshots.forEach((snap) => {
      const d = format(snap.capturedAt, "EEE");
      if (perfMap.has(d)) {
        const val = perfMap.get(d)!;
        val.views += snap.views ?? 0;
        val.engagement += (snap.likes ?? 0) + (snap.comments ?? 0);
      }
    });

    const performanceHistory = Array.from(perfMap.entries())
      .reverse()
      .map(([day, data]) => ({ day, ...data }));

    // 2. Platform Mix
    const totalPublished = platformMixRaw.reduce((acc, curr) => acc + curr._count._all, 0);
    const platformColors: Record<string, string> = {
      YOUTUBE: "#ef4444",
      INSTAGRAM: "#ec4899",
      TIKTOK: "#06b6d4",
      LINKEDIN: "#2563eb",
      X: "#71717a"
    };

    const platformMix = platformMixRaw.map((p) => ({
      name: p.platform,
      value: totalPublished > 0 ? Math.round((p._count._all / totalPublished) * 100) : 0,
      color: platformColors[p.platform] ?? "#71717a"
    }));

    // 3. System Health
    const youtubeQuota = quotaLedgers[0];
    const storageBytes = storageUsedRaw._sum.fileSizeBytes ?? 0;
    const storageGB = Number((storageBytes / (1024 * 1024 * 1024)).toFixed(2));
    const storageLimitGB = 10; // Default limit for now

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
        total: `${storageLimitGB} GB`,
        pct: Math.min(100, Math.round((storageGB / storageLimitGB) * 100)),
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
      publishedPosts: publishedCount,
      pendingReview: pendingCount,
      latestOpportunityReportAt: latestReport?.generatedAt ?? null,
      performanceHistory,
      platformMix,
      systemHealth
    };
  }

  async listPosts(workspaceId: string) {
    return this.prisma.platformPost.findMany({
      where: { workspaceId },
      include: {
        asset: true,
        decision: {
          include: {
            metadataVariant: true,
            campaignWave: true
          }
        },
        connectedAccount: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async listAssets(workspaceId: string) {
    const [assets, channelTrends, youtubeVideos] = await Promise.all([
      this.prisma.asset.findMany({
        where: { workspaceId },
        include: {
          tags: true,
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
                            take: 3
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
      if (!trendByChannelId.has(trend.channelId)) {
        trendByChannelId.set(trend.channelId, trend);
      }
    }

    const youtubeVideoByExternalId = new Map(youtubeVideos.map((video) => [video.externalVideoId, video] as const));
    return assets.map((asset) => {
      const decisions = asset.campaigns.flatMap((campaign) => campaign.waves).flatMap((wave) => wave.decisions);
      const youtubeDecision = decisions.find((decision) => decision.platform === "YOUTUBE" && decision.post?.externalPostId);
      const linkedVideo = youtubeDecision?.post?.externalPostId
        ? youtubeVideoByExternalId.get(youtubeDecision.post.externalPostId)
        : undefined;
      const trend = linkedVideo ? trendByChannelId.get(linkedVideo.channelId) : undefined;
      const freshnessAt =
        decisions
          .flatMap((decision) => decision.post?.snapshots ?? [])
          .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0]?.capturedAt ?? null;

      return {
        ...asset,
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
