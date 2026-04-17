import { type PrismaClient } from "@prisma/client";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(workspaceId: string) {
    const [assets, publishedPosts, pendingReview, latestReport] = await Promise.all([
      this.prisma.asset.count({ where: { workspaceId } }),
      this.prisma.platformPost.count({ where: { workspaceId, status: "PUBLISHED" } }),
      this.prisma.asset.count({ where: { workspaceId, status: "PENDING_REVIEW" } }),
      this.prisma.opportunityReport.findFirst({
        where: { workspaceId },
        orderBy: { generatedAt: "desc" }
      })
    ]);

    return {
      assets,
      publishedPosts,
      pendingReview,
      latestOpportunityReportAt: latestReport?.generatedAt ?? null
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
