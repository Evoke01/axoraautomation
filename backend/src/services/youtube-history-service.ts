import { endOfDay, startOfDay, subDays } from "date-fns";
import { ConnectedAccountStatus, Platform, type PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import {
  type YouTubeChannelAnalyticsPoint,
  type YouTubeChannelStatistics,
  type YouTubePublicVideo,
  YouTubeAdapter
} from "../adapters/youtube-adapter.js";
import { getFreshnessMinutes, getNextYouTubePostMetricDelayMinutes } from "../lib/youtube-freshness.js";
import { buildJobId, getJobPolicy } from "../queues/job-policy.js";
import { JobName } from "../queues/names.js";

export class YouTubeHistoryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Queue,
    private readonly youtube: YouTubeAdapter
  ) {}

  async syncWorkspaceChannels(workspaceId?: string) {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: {
        platform: Platform.YOUTUBE,
        status: ConnectedAccountStatus.ACTIVE,
        ...(workspaceId ? { workspaceId } : {})
      }
    });

    for (const account of accounts) {
      const stats = await this.youtube.getOwnChannelStatistics(account.id).catch(() => null);
      const externalChannelId = stats?.channelId ?? account.externalAccountId ?? account.id;
      const title =
        stats?.title ??
        (account.metadata as { channelTitle?: string } | null)?.channelTitle ??
        account.accountLabel;

      const channel = await this.prisma.youtubeChannel.upsert({
        where: {
          workspaceId_externalChannelId: {
            workspaceId: account.workspaceId,
            externalChannelId
          }
        },
        update: {
          title,
          description: stats?.description,
          connectedAccountId: account.id,
          lastSyncedAt: new Date()
        },
        create: {
          workspaceId: account.workspaceId,
          connectedAccountId: account.id,
          externalChannelId,
          title,
          description: stats?.description,
          genreHint: null,
          lastSyncedAt: new Date()
        }
      });

      await this.queue.add(
        JobName.YouTubeVideoBackfill,
        { channelId: channel.id },
        {
          ...getJobPolicy(JobName.YouTubeVideoBackfill),
          jobId: buildJobId(JobName.YouTubeVideoBackfill, channel.id)
        }
      );
    }
  }

  async refreshWorkspaceChannelAnalytics(workspaceId?: string) {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: {
        platform: Platform.YOUTUBE,
        status: ConnectedAccountStatus.ACTIVE,
        ...(workspaceId ? { workspaceId } : {})
      }
    });

    for (const account of accounts) {
      const stats = await this.youtube.getOwnChannelStatistics(account.id).catch(() => null);
      if (!stats) {
        continue;
      }

      const channel = await this.upsertChannelForAccount(account.id, account.workspaceId, stats);
      const hasAnalyticsAccess = await this.youtube.hasAnalyticsAccess(account.id).catch(() => false);
      const today = new Date();
      let analyticsPoints: YouTubeChannelAnalyticsPoint[] = [];

      if (hasAnalyticsAccess) {
        analyticsPoints = await this.youtube
          .getChannelDailyAnalytics(
            account.id,
            formatDate(subDays(today, 13)),
            formatDate(today)
          )
          .catch(() => []);

        for (const point of analyticsPoints) {
          await this.prisma.youtubeChannelSeriesPoint.upsert({
            where: {
              channelId_granularity_bucketStart: {
                channelId: channel.id,
                granularity: "DAY",
                bucketStart: startOfDay(point.day)
              }
            },
            update: {
              views: point.views,
              likes: point.likes,
              comments: point.comments,
              watchTimeMinutes: point.watchTimeMinutes,
              rawMetrics: serializeAnalyticsPoint(point)
            },
            create: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              granularity: "DAY",
              bucketStart: startOfDay(point.day),
              views: point.views,
              likes: point.likes,
              comments: point.comments,
              watchTimeMinutes: point.watchTimeMinutes,
              rawMetrics: serializeAnalyticsPoint(point)
            }
          });
        }
      }

      const recentWindow = analyticsPoints.slice(-2);
      const recentViews = recentWindow.reduce((sum, point) => sum + point.views, 0);
      const recentLikes = recentWindow.reduce((sum, point) => sum + point.likes, 0);
      const recentComments = recentWindow.reduce((sum, point) => sum + point.comments, 0);
      const watchTimeMinutes = recentWindow.reduce((sum, point) => sum + point.watchTimeMinutes, 0);
      const averageViewDurationSec =
        recentViews > 0 ? Number(((watchTimeMinutes * 60) / recentViews).toFixed(2)) : null;

      await this.prisma.youtubeChannelSnapshot.create({
        data: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          totalViews: stats.totalViews,
          totalSubscribers: stats.subscriberCount,
          totalVideos: stats.totalVideos,
          recentViews: hasAnalyticsAccess ? recentViews : null,
          recentLikes: hasAnalyticsAccess ? recentLikes : null,
          recentComments: hasAnalyticsAccess ? recentComments : null,
          watchTimeMinutes: hasAnalyticsAccess ? watchTimeMinutes : null,
          averageViewDurationSec,
          rawMetrics: {
            statistics: stats.rawPayload,
            analyticsAvailable: hasAnalyticsAccess,
            analyticsPoints: analyticsPoints.map(serializeAnalyticsPoint)
          } as any
        }
      });

      await this.prisma.youtubeChannel.update({
        where: { id: channel.id },
        data: {
          title: stats.title,
          description: stats.description,
          lastSyncedAt: new Date()
        }
      });
    }
  }

  async refreshWorkspaceCompetitors(workspaceId?: string) {
    const workspaces = workspaceId
      ? [{ id: workspaceId }]
      : await this.prisma.workspace.findMany({ select: { id: true } });

    for (const workspace of workspaces) {
      const account = await this.prisma.connectedAccount.findFirst({
        where: {
          workspaceId: workspace.id,
          platform: Platform.YOUTUBE,
          status: ConnectedAccountStatus.ACTIVE
        },
        orderBy: { createdAt: "asc" }
      });

      if (!account) {
        continue;
      }

      const competitors = await this.prisma.competitorChannel.findMany({
        where: {
          workspaceId: workspace.id,
          platform: Platform.YOUTUBE
        },
        orderBy: { createdAt: "asc" }
      });

      for (const competitor of competitors) {
        const publicStats = await this.youtube
          .getPublicChannelStatistics(account.id, competitor.externalChannelId)
          .catch(() => null);
        const publicVideos = await this.youtube
          .listPublicChannelVideos(account.id, competitor.externalChannelId, 12)
          .catch(() => []);

        const topicKeywords = extractTopicKeywords(publicVideos);
        const existingVideos = await this.prisma.competitorVideo.findMany({
          where: { competitorChannelId: competitor.id }
        });
        const previousByExternalId = new Map(
          existingVideos.map((video) => [video.externalVideoId, video] as const)
        );

        for (const video of publicVideos) {
          const previous = previousByExternalId.get(video.externalVideoId);
          const velocityPerHour = computeVelocity(
            video.views,
            previous?.views,
            previous?.lastSyncedAt ?? previous?.updatedAt
          );

          await this.prisma.competitorVideo.upsert({
            where: {
              competitorChannelId_externalVideoId: {
                competitorChannelId: competitor.id,
                externalVideoId: video.externalVideoId
              }
            },
            update: {
              title: video.title,
              description: video.description,
              publishedAt: video.publishedAt,
              durationSeconds: video.durationSeconds ? Math.round(video.durationSeconds) : null,
              tags: video.tags,
              views: video.views,
              likes: video.likes,
              comments: video.comments,
              velocityPerHour,
              rawPayload: video.rawPayload as any,
              lastSyncedAt: new Date()
            },
            create: {
              workspaceId: competitor.workspaceId,
              competitorChannelId: competitor.id,
              externalVideoId: video.externalVideoId,
              title: video.title,
              description: video.description,
              publishedAt: video.publishedAt,
              durationSeconds: video.durationSeconds ? Math.round(video.durationSeconds) : null,
              tags: video.tags,
              views: video.views,
              likes: video.likes,
              comments: video.comments,
              velocityPerHour,
              rawPayload: video.rawPayload as any,
              lastSyncedAt: new Date()
            }
          });
        }

        await this.prisma.competitorChannel.update({
          where: { id: competitor.id },
          data: {
            name: publicStats?.title ?? competitor.name,
            subscriberCount: publicStats?.subscriberCount,
            videoCount: publicStats?.totalVideos,
            viewCount: publicStats?.totalViews,
            topicKeywords,
            lastSyncedAt: new Date()
          }
        });

        if (publicVideos.length > 0) {
          await this.prisma.competitorObservation.create({
            data: {
              competitorChannelId: competitor.id,
              contentCategory: topicKeywords[0] ?? "general",
              formatType: inferFormatType(publicVideos),
              hookStyle: inferHookStyle(publicVideos),
              postingWindow: dominantPostingWindow(publicVideos.map((video) => video.publishedAt)),
              engagementBand: computeEngagementBand(publicVideos),
              topicKeywords,
              rawMetrics: {
                sampleSize: publicVideos.length,
                avgViews: average(publicVideos.map((video) => video.views)),
                avgInteractions: average(publicVideos.map((video) => video.likes + video.comments))
              } as any
            }
          });
        }
      }
    }
  }

  async refreshDuePostMetrics(workspaceId?: string) {
    const now = new Date();
    const duePosts = await this.prisma.platformPost.findMany({
      where: {
        platform: Platform.YOUTUBE,
        status: "PUBLISHED",
        publishedAt: {
          gte: subDays(now, 30)
        },
        connectedAccountId: { not: null },
        ...(workspaceId ? { workspaceId } : {}),
        OR: [
          { nextPollAt: null },
          { nextPollAt: { lte: now } }
        ]
      },
      orderBy: { nextPollAt: "asc" }
    });

    if (duePosts.length === 0) {
      return [];
    }

    const postsByAccount = new Map<string, typeof duePosts>();
    for (const post of duePosts) {
      if (!post.connectedAccountId) {
        continue;
      }

      const existing = postsByAccount.get(post.connectedAccountId) ?? [];
      existing.push(post);
      postsByAccount.set(post.connectedAccountId, existing);
    }

    const touchedWorkspaces = new Set<string>();
    for (const [accountId, posts] of postsByAccount.entries()) {
      const results = await this.youtube.refreshMetrics(posts.map((post) => post.id));
      const resultMap = new Map(results.map((result) => [result.postId, result.metrics] as const));

      for (const post of posts) {
        const metrics = resultMap.get(post.id);
        if (!metrics) {
          continue;
        }

        const nextDelayMinutes = getNextYouTubePostMetricDelayMinutes(post.publishedAt, now);
        await this.prisma.postMetricsSnapshot.create({
          data: {
            platformPostId: post.id,
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            rawMetrics: metrics
          }
        });

        await this.prisma.platformPost.update({
          where: { id: post.id },
          data: {
            pollCount: post.pollCount + 1,
            lastPolledAt: now,
            metrics,
            nextPollAt: nextDelayMinutes === null ? null : new Date(now.getTime() + nextDelayMinutes * 60_000)
          }
        });

        touchedWorkspaces.add(post.workspaceId);
      }
    }

    return [...touchedWorkspaces];
  }

  async backfillChannelVideos(channelId: string) {
    const channel = await this.prisma.youtubeChannel.findUnique({
      where: { id: channelId }
    });
    if (!channel) {
      return;
    }

    const videos = await this.youtube.listOwnChannelVideos(channel.connectedAccountId, 50);
    for (const video of videos) {
      const genreHint = pickGenre(video.tags);
      const saved = await this.prisma.youtubeVideo.upsert({
        where: {
          channelId_externalVideoId: {
            channelId: channel.id,
            externalVideoId: video.externalVideoId
          }
        },
        update: {
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds ? Math.round(video.durationSeconds) : null,
          tags: video.tags,
          genreHint,
          rawPayload: video.rawPayload as any
        },
        create: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          externalVideoId: video.externalVideoId,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds ? Math.round(video.durationSeconds) : null,
          tags: video.tags,
          genreHint,
          rawPayload: video.rawPayload as any
        }
      });

      await this.queue.add(
        JobName.YouTubeMetricsSnapshot,
        { videoId: saved.id },
        {
          ...getJobPolicy(JobName.YouTubeMetricsSnapshot),
          jobId: buildJobId(JobName.YouTubeMetricsSnapshot, saved.id)
        }
      );
    }

    await this.prisma.youtubeChannel.update({
      where: { id: channel.id },
      data: {
        genreHint: pickGenre(videos.flatMap((video) => video.tags)),
        lastSyncedAt: new Date()
      }
    });
  }

  async captureVideoSnapshot(videoId: string) {
    const video = await this.prisma.youtubeVideo.findUnique({
      where: { id: videoId },
      include: {
        channel: true
      }
    });
    if (!video) {
      return;
    }

    const metrics = await this.youtube.getVideoMetrics(video.channel.connectedAccountId, [video.externalVideoId]);
    const metric = metrics[0];
    if (!metric) {
      return;
    }

    const previous = await this.prisma.youtubeVideoSnapshot.findFirst({
      where: { videoId },
      orderBy: { capturedAt: "desc" }
    });

    const velocityPerHour = computeVelocity(metric.views, previous?.views, previous?.capturedAt);
    await this.prisma.youtubeVideoSnapshot.create({
      data: {
        workspaceId: video.workspaceId,
        channelId: video.channelId,
        videoId: video.id,
        views: metric.views,
        likes: metric.likes,
        comments: metric.comments,
        likeRate: metric.views > 0 ? metric.likes / metric.views : 0,
        commentRate: metric.views > 0 ? metric.comments / metric.views : 0,
        velocityPerHour,
        rawMetrics: metric.rawMetrics as any
      }
    });

    await this.recomputeChannelTrendWindows(video.channelId);
  }

  private async upsertChannelForAccount(accountId: string, workspaceId: string, stats: YouTubeChannelStatistics) {
    return this.prisma.youtubeChannel.upsert({
      where: {
        workspaceId_externalChannelId: {
          workspaceId,
          externalChannelId: stats.channelId
        }
      },
      update: {
        connectedAccountId: accountId,
        title: stats.title,
        description: stats.description,
        lastSyncedAt: new Date()
      },
      create: {
        workspaceId,
        connectedAccountId: accountId,
        externalChannelId: stats.channelId,
        title: stats.title,
        description: stats.description,
        lastSyncedAt: new Date()
      }
    });
  }

  private async recomputeChannelTrendWindows(channelId: string) {
    const channel = await this.prisma.youtubeChannel.findUnique({
      where: { id: channelId }
    });
    if (!channel) {
      return;
    }

    const now = Date.now();
    const windows = [7, 14, 30];
    for (const windowDays of windows) {
      const since = new Date(now - windowDays * 24 * 60 * 60 * 1000);
      const snapshots = await this.prisma.youtubeVideoSnapshot.findMany({
        where: {
          channelId,
          capturedAt: { gte: since }
        },
        include: { video: true }
      });

      if (snapshots.length === 0) {
        continue;
      }

      const views = snapshots.map((snapshot) => snapshot.views);
      const likes = snapshots.map((snapshot) => snapshot.likes);
      const comments = snapshots.map((snapshot) => snapshot.comments);
      const postingWindows = bucketPostingWindows(snapshots.map((snapshot) => snapshot.video.publishedAt));
      const topGenre = pickGenre(
        snapshots.map((snapshot) => snapshot.video.genreHint).filter(Boolean) as string[]
      );

      await this.prisma.channelTrendWindow.create({
        data: {
          workspaceId: channel.workspaceId,
          channelId,
          windowDays,
          sampleSize: snapshots.length,
          avgViews: average(views),
          avgLikes: average(likes),
          avgComments: average(comments),
          medianViews: median(views),
          topGenre: topGenre || null,
          publishingWindows: postingWindows as any,
          confidence: Math.min(1, snapshots.length / 30)
        }
      });
    }
  }
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
}

function computeVelocity(currentViews: number, previousViews?: number, previousCapturedAt?: Date) {
  if (typeof previousViews !== "number" || !previousCapturedAt) {
    return null;
  }

  const elapsedHours = Math.max((Date.now() - previousCapturedAt.getTime()) / (1000 * 60 * 60), 0.01);
  return Number(((currentViews - previousViews) / elapsedHours).toFixed(2));
}

function pickGenre(candidates: string[]) {
  if (candidates.length === 0) {
    return "";
  }

  const normalized = candidates.map((candidate) => candidate.trim().toLowerCase()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const value of normalized) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best = "";
  let bestCount = -1;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function bucketPostingWindows(dates: Date[]) {
  const buckets = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0
  };

  for (const date of dates) {
    const hour = date.getUTCHours();
    if (hour >= 6 && hour < 12) {
      buckets.morning += 1;
    } else if (hour >= 12 && hour < 17) {
      buckets.afternoon += 1;
    } else if (hour >= 17 && hour < 22) {
      buckets.evening += 1;
    } else {
      buckets.night += 1;
    }
  }

  return buckets;
}

function dominantPostingWindow(dates: Date[]) {
  const windows = bucketPostingWindows(dates);
  return Object.entries(windows).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "evening";
}

function inferFormatType(videos: YouTubePublicVideo[]) {
  const shorts = videos.filter((video) => (video.durationSeconds ?? 0) <= 60).length;
  if (shorts >= Math.ceil(videos.length / 2)) {
    return "shorts";
  }
  return "long-form";
}

function inferHookStyle(videos: YouTubePublicVideo[]) {
  const titles = videos.map((video) => video.title.toLowerCase());
  if (titles.some((title) => title.includes("how ") || title.includes("how to"))) {
    return "how-to";
  }
  if (titles.some((title) => /\d/.test(title))) {
    return "number-led";
  }
  if (titles.some((title) => title.includes("why") || title.includes("secret"))) {
    return "curiosity";
  }
  return "statement";
}

function computeEngagementBand(videos: YouTubePublicVideo[]) {
  const avgRate = average(
    videos.map((video) =>
      video.views > 0 ? (video.likes + video.comments) / video.views : 0
    )
  );

  if (avgRate >= 0.08) {
    return "high";
  }
  if (avgRate >= 0.04) {
    return "medium";
  }
  return "low";
}

function extractTopicKeywords(videos: YouTubePublicVideo[]) {
  const source = videos.flatMap((video) => [
    video.title,
    video.description,
    ...(video.tags ?? [])
  ]);

  const tokens = source
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function serializeAnalyticsPoint(point: YouTubeChannelAnalyticsPoint) {
  return {
    day: point.day.toISOString(),
    views: point.views,
    likes: point.likes,
    comments: point.comments,
    watchTimeMinutes: point.watchTimeMinutes
  };
}

const STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "your",
  "have",
  "will",
  "into",
  "about",
  "what",
  "when",
  "where",
  "which",
  "there",
  "their",
  "video"
]);
