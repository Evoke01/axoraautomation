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
      include: {
        competitorChannel: true
      },
      orderBy: {
        observedAt: "desc"
      },
      take: 20
    });

    const competitors = competitorSignals.slice(0, 5).map((signal) => ({
      name: signal.competitorChannel.name,
      followers: "Unknown",
      engagement: "N/A",
      posts: signal.postingWindow,
      trend: signal.engagementBand.includes("High") ? "up" : signal.engagementBand.includes("Low") ? "down" : "stable"
    }));

    const opportunities = [];

    const firstSignal = competitorSignals[0];
    const secondSignal = competitorSignals[1];

    if (firstSignal) {
      opportunities.push({
        type: "Gap",
        priority: "high",
        title: `Upload window gap: ${firstSignal.postingWindow}`,
        description: `Competitors are active during this window. Analyzing patterns shows potential whitespace.`,
        action: `Schedule next content for the ${firstSignal.postingWindow} slot`,
        platform: firstSignal.competitorChannel.platform
      });

      if (secondSignal) {
        opportunities.push({
          type: "Trend",
          priority: "medium",
          title: `Format gaining traction: ${secondSignal.formatType}`,
          description: `Competing creators utilizing ${secondSignal.hookStyle} hooks are testing this format.`,
          action: `Repackage upcoming content to trial ${secondSignal.formatType} formats`,
          platform: secondSignal.competitorChannel.platform
        });
      }
    }

    const firstPost = topPosts[0];
    if (firstPost) {
      opportunities.push({
        type: "Saturation",
        priority: "low",
        title: `Current top asset performing well: ${firstPost.asset.title}`,
        description: `Your piece is outperforming baselines. Monitor for fatigue.`,
        action: `Double down on the hooks used in this topic`,
        platform: firstPost.platform
      });
    }

    return this.prisma.opportunityReport.create({
      data: {
        workspaceId,
        periodStart: start,
        periodEnd: end,
        status: "generated",
        report: {
          opportunities,
          competitors
        }
      }
    });
  }
}
