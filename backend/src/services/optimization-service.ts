import { Platform, PostStatus, type PrismaClient } from "@prisma/client";

import { getWeeklyWindow } from "../lib/time.js";

export class OptimizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async recompute(workspaceId: string) {
    const snapshots = await this.prisma.postMetricsSnapshot.findMany({
      where: {
        platformPost: {
          workspaceId
        }
      },
      include: {
        platformPost: {
          include: {
            decision: true
          }
        }
      },
      orderBy: {
        capturedAt: "desc"
      },
      take: 100
    });

    const views = snapshots.map((snapshot) => snapshot.views ?? 0);
    const averageViews = views.length > 0 ? views.reduce((sum, value) => sum + value, 0) / views.length : 0;

    return this.prisma.optimizationSnapshot.create({
      data: {
        workspaceId,
        predictionError: averageViews === 0 ? 0 : Number((averageViews / 1000).toFixed(2)),
        timingWeights: {
          morning: 0.8,
          afternoon: 1.0,
          evening: 1.15
        },
        platformWeights: {
          [Platform.YOUTUBE]: 1.0
        },
        hookWeights: {
          direct: 1.0,
          curiosity: 1.05,
          dataPoint: 0.95
        },
        decisionSummary: {
          sampleSize: snapshots.length,
          averageViews
        }
      }
    });
  }

  pickSecondWaveAction(input: { hoursSincePublish: number; views: number; baselineViews: number }) {
    if (input.hoursSincePublish >= 72 && input.views < input.baselineViews * 0.25) {
      return "archive";
    }

    if (input.hoursSincePublish >= 24 && input.views < input.baselineViews * 0.5) {
      return "regenerate_metadata";
    }

    return "hold";
  }

  async generateOpportunityReport(workspaceId: string, timezone: string) {
    const { start, end } = getWeeklyWindow(new Date(), timezone);

    const topPosts = await this.prisma.platformPost.findMany({
      where: {
        workspaceId,
        status: PostStatus.PUBLISHED,
        publishedAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        asset: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      },
      take: 5
    });

    const competitorSignals = await this.prisma.competitorObservation.findMany({
      where: {
        competitorChannel: {
          workspaceId,
          platform: Platform.YOUTUBE
        },
        observedAt: {
          gte: start,
          lte: end
        }
      },
      orderBy: {
        observedAt: "desc"
      },
      take: 20
    });

    return this.prisma.opportunityReport.create({
      data: {
        workspaceId,
        periodStart: start,
        periodEnd: end,
        status: "generated",
        report: {
          topAssets: topPosts.map((post) => ({
            title: post.asset.title,
            views: post.snapshots[0]?.views ?? 0
          })),
          whitespace: competitorSignals.slice(0, 5).map((signal) => ({
            category: signal.contentCategory,
            postingWindow: signal.postingWindow,
            hookStyle: signal.hookStyle
          }))
        }
      }
    });
  }
}
