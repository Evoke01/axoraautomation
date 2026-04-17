import { ConnectedAccountStatus, Platform, type PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import { YouTubeAdapter } from "../adapters/youtube-adapter.js";
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
      const externalChannelId = account.externalAccountId ?? account.id;
      const title = (account.metadata as { channelTitle?: string } | null)?.channelTitle ?? account.accountLabel;
      const channel = await this.prisma.youtubeChannel.upsert({
        where: {
          workspaceId_externalChannelId: {
            workspaceId: account.workspaceId,
            externalChannelId
          }
        },
        update: {
          title,
          connectedAccountId: account.id,
          lastSyncedAt: new Date()
        },
        create: {
          workspaceId: account.workspaceId,
          connectedAccountId: account.id,
          externalChannelId,
          title,
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
          durationSeconds: video.durationSeconds,
          tags: video.tags,
          genreHint,
          rawPayload: video.rawPayload
        },
        create: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          externalVideoId: video.externalVideoId,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
          tags: video.tags,
          genreHint,
          rawPayload: video.rawPayload
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
        rawMetrics: metric.rawMetrics
      }
    });

    await this.recomputeChannelTrendWindows(video.channelId);
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
      const topGenre = pickGenre(snapshots.map((snapshot) => snapshot.video.genreHint).filter(Boolean) as string[]);

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
          publishingWindows: postingWindows,
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
