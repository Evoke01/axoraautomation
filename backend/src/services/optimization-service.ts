import { Platform, PostStatus, type PrismaClient } from "@prisma/client";

import { getWeeklyWindow } from "../lib/time.js";

export class OptimizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async recompute(workspaceId: string) {
    const posts = await this.prisma.platformPost.findMany({
      where: {
        workspaceId,
        status: PostStatus.PUBLISHED
      },
      orderBy: {
        lastPolledAt: "desc"
      },
      take: 100
    });

    const views = posts.map((post) => {
      const metrics = post.metrics as Record<string, unknown> | null;
      return typeof metrics?.views === "number" ? metrics.views : 0;
    });
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
          sampleSize: posts.length,
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

    const trendWindows = await this.prisma.channelTrendWindow.findMany({
      where: {
        workspaceId,
        windowDays: { in: [7, 14, 30] },
        computedAt: {
          gte: start
        }
      },
      include: {
        channel: true
      },
      orderBy: {
        computedAt: "desc"
      }
    });

    const newestByWindow = new Map<number, (typeof trendWindows)[number]>();
    for (const window of trendWindows) {
      if (!newestByWindow.has(window.windowDays)) {
        newestByWindow.set(window.windowDays, window);
      }
    }

    const weekly = newestByWindow.get(7);
    const biweekly = newestByWindow.get(14);
    const monthly = newestByWindow.get(30);

    const opportunities: Array<Record<string, unknown>> = [];
    if (weekly && monthly) {
      const velocity = monthly.avgViews > 0 ? (weekly.avgViews - monthly.avgViews) / monthly.avgViews : 0;
      opportunities.push({
        type: "Velocity",
        priority: velocity >= 0 ? "medium" : "high",
        title: velocity >= 0 ? "Momentum increasing in the last 7 days" : "Recent velocity dip detected",
        description: `7d average views are ${formatPercent(Math.abs(velocity))} ${velocity >= 0 ? "above" : "below"} the 30d baseline.`,
        action:
          velocity >= 0
            ? "Prioritize formats similar to recent winners while momentum is high."
            : "Re-test thumbnail/hook combinations and adjust posting windows for next wave.",
        platform: Platform.YOUTUBE,
        confidence: Number(weekly.confidence.toFixed(2)),
        sampleSize: weekly.sampleSize
      });
    }

    if (weekly) {
      const windows = weekly.publishingWindows as Record<string, number>;
      const bestWindow = Object.entries(windows).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "evening";
      opportunities.push({
        type: "Timing",
        priority: "medium",
        title: `Best observed posting window: ${bestWindow}`,
        description: "Window ranking is generated from recent channel history snapshots.",
        action: `Schedule the next two videos in the ${bestWindow} window and compare lift vs baseline.`,
        platform: Platform.YOUTUBE,
        confidence: Number(weekly.confidence.toFixed(2)),
        sourceFreshnessHours: Number(((Date.now() - weekly.computedAt.getTime()) / 3_600_000).toFixed(1))
      });
    }

    if (biweekly?.topGenre) {
      opportunities.push({
        type: "Genre",
        priority: "low",
        title: `Genre signal: ${biweekly.topGenre}`,
        description: "Top genre is inferred from recurring tags across historical videos.",
        action: `Create one experimental asset that leans into ${biweekly.topGenre} framing this week.`,
        platform: Platform.YOUTUBE,
        confidence: Number(biweekly.confidence.toFixed(2)),
        sampleSize: biweekly.sampleSize
      });
    }

    const firstPost = topPosts[0];
    if (firstPost) {
      const latestSnapshot = firstPost.snapshots[0];
      opportunities.push({
        type: "Asset",
        priority: "low",
        title: `Current top asset: ${firstPost.asset.title}`,
        description: `Latest observed views: ${latestSnapshot?.views ?? 0}.`,
        action: "Reuse the opening hook pattern and keep CTA structure similar for the next publish.",
        platform: firstPost.platform,
        confidence: 0.6,
        sampleSize: 1
      });
    }

    const competitors = trendWindows.slice(0, 5).map((window) => ({
      name: window.channel.title,
      followers: "Unknown",
      engagement: `${(window.avgLikes + window.avgComments).toFixed(1)} avg interactions`,
      posts: `${window.windowDays}d window`,
      trend: weekly && weekly.avgViews >= window.avgViews ? "up" : "stable",
      confidence: Number(window.confidence.toFixed(2)),
      genre: window.topGenre,
      freshnessHours: Number(((Date.now() - window.computedAt.getTime()) / 3_600_000).toFixed(1))
    }));

    return this.prisma.opportunityReport.create({
      data: {
        workspaceId,
        periodStart: start,
        periodEnd: end,
        status: "generated",
        report: {
          opportunities: opportunities as any,
          competitors: competitors as any,
          meta: {
            source: "youtube-history-v2",
            generatedAt: new Date().toISOString(),
            windowsUsed: [7, 14, 30],
            provenance: "api"
          }
        }
      }
    });
  }
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
