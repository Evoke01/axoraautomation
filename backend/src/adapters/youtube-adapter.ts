import { randomBytes } from "node:crypto";

import { eachDayOfInterval, subDays } from "date-fns";
import { google, type youtube_v3 } from "googleapis";
import { ConnectedAccountStatus, Platform, PostStatus, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { decryptValue, encryptValue } from "../lib/crypto.js";
import { AuthError, NotFoundError } from "../lib/errors.js";
import type { StorageService } from "../lib/storage.js";
import { AuditService } from "../services/audit-service.js";

export const YOUTUBE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  YOUTUBE_ANALYTICS_SCOPE
];

export type YouTubeChannelVideo = {
  externalVideoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  durationSeconds: number | null;
  tags: string[];
  rawPayload: Record<string, unknown>;
};

export type YouTubePublicVideo = YouTubeChannelVideo & {
  views: number;
  likes: number;
  comments: number;
};

export type YouTubeChannelStatistics = {
  channelId: string;
  title: string;
  description: string;
  totalViews: number;
  subscriberCount: number | null;
  totalVideos: number;
  rawPayload: Record<string, unknown>;
};

export type YouTubePublicChannelStatistics = {
  channelId: string;
  title: string;
  description: string;
  subscriberCount: number | null;
  totalVideos: number | null;
  totalViews: number | null;
  rawPayload: Record<string, unknown>;
};

export type YouTubeChannelAnalyticsPoint = {
  day: Date;
  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes: number;
};

export class YouTubeAdapter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  private createClient() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new AuthError("Google OAuth credentials are not configured.");
    }

    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );
  }

  async getAuthorizationUrl(workspaceId: string) {
    const state = randomBytes(24).toString("hex");
    const client = this.createClient();

    await this.prisma.oAuthState.create({
      data: {
        workspaceId,
        provider: Platform.YOUTUBE,
        state,
        redirectUri: env.GOOGLE_REDIRECT_URI!,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    return client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: YOUTUBE_SCOPES,
      state
    });
  }

  async handleCallback(state: string, code: string) {
    const oauthState = await this.prisma.oAuthState.findUnique({
      where: { state }
    });

    if (!oauthState || oauthState.expiresAt < new Date()) {
      throw new AuthError("OAuth state has expired.");
    }

    const client = this.createClient();
    const tokenResponse = await client.getToken(code);
    const tokens = tokenResponse.tokens;

    client.setCredentials(tokens);

    const youtube = google.youtube({ version: "v3", auth: client });
    const channelResponse = await youtube.channels.list({
      mine: true,
      part: ["snippet", "statistics"]
    });

    const channel = channelResponse.data.items?.[0];
    const channelId = channel?.id ?? `youtube:${oauthState.workspaceId}`;
    const accountLabel = channel?.snippet?.title ?? "YouTube Channel";

    const existing = await this.prisma.connectedAccount.findFirst({
      where: {
        workspaceId: oauthState.workspaceId,
        platform: Platform.YOUTUBE,
        externalAccountId: channelId
      }
    });

    const grantedScopes = normalizeScopes(tokens.scope ?? existing?.scopes ?? YOUTUBE_SCOPES);
    const data = {
      accountLabel,
      status: ConnectedAccountStatus.ACTIVE,
      externalAccountId: channelId,
      accessTokenEncrypted: tokens.access_token ? encryptValue(tokens.access_token) : existing?.accessTokenEncrypted,
      refreshTokenEncrypted: tokens.refresh_token ? encryptValue(tokens.refresh_token) : existing?.refreshTokenEncrypted,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.tokenExpiresAt,
      scopes: grantedScopes,
      metadata: {
        channelTitle: accountLabel,
        analyticsEnabled: hasYouTubeAnalyticsScope(grantedScopes),
        subscriberCount: Number(channel?.statistics?.subscriberCount ?? 0),
        videoCount: Number(channel?.statistics?.videoCount ?? 0)
      }
    };

    const account = existing
      ? await this.prisma.connectedAccount.update({
          where: { id: existing.id },
          data
        })
      : await this.prisma.connectedAccount.create({
          data: {
            workspaceId: oauthState.workspaceId,
            platform: Platform.YOUTUBE,
            ...data
          }
        });

    await this.prisma.oAuthState.delete({ where: { id: oauthState.id } });

    await this.audit.log({
      workspaceId: oauthState.workspaceId,
      eventType: "youtube.account_connected",
      targetType: "ACCOUNT",
      targetId: account.id,
      payload: {
        channelId,
        accountLabel,
        analyticsEnabled: hasYouTubeAnalyticsScope(grantedScopes)
      }
    });

    return account;
  }

  async ensureFresh(accountId: string, minTtlMinutes = 15) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.platform !== Platform.YOUTUBE) {
      throw new NotFoundError("YouTube account not found.");
    }

    const client = this.createClient();
    const accessToken = account.accessTokenEncrypted ? decryptValue(account.accessTokenEncrypted) : undefined;
    const refreshToken = account.refreshTokenEncrypted ? decryptValue(account.refreshTokenEncrypted) : undefined;
    const expiringSoon =
      !account.tokenExpiresAt ||
      account.tokenExpiresAt.getTime() - Date.now() <= minTtlMinutes * 60 * 1000;

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.tokenExpiresAt?.getTime()
    });

    if (!refreshToken && (!accessToken || expiringSoon)) {
      await this.prisma.connectedAccount.update({
        where: { id: account.id },
        data: { status: ConnectedAccountStatus.REAUTH_REQUIRED }
      });
      throw new AuthError("YouTube account requires reauthentication.");
    }

    if (expiringSoon) {
      await client.getAccessToken();
      await this.prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          status: ConnectedAccountStatus.ACTIVE,
          accessTokenEncrypted: client.credentials.access_token
            ? encryptValue(client.credentials.access_token)
            : account.accessTokenEncrypted,
          refreshTokenEncrypted: client.credentials.refresh_token
            ? encryptValue(client.credentials.refresh_token)
            : account.refreshTokenEncrypted,
          tokenExpiresAt: client.credentials.expiry_date
            ? new Date(client.credentials.expiry_date)
            : account.tokenExpiresAt
        }
      });
    }

    return client;
  }

  async getOwnChannelStatistics(accountId: string): Promise<YouTubeChannelStatistics | null> {
    if (this.shouldUseMock()) {
      return {
        channelId: `mock-channel-${accountId.slice(0, 6)}`,
        title: "Mock Axora Channel",
        description: "Mock channel statistics for local development.",
        totalViews: 125_000,
        subscriberCount: 12_400,
        totalVideos: 87,
        rawPayload: { mock: true }
      };
    }

    const client = await this.ensureFresh(accountId, 30);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.channels.list({
      mine: true,
      part: ["snippet", "statistics"]
    });

    const channel = response.data.items?.[0];
    if (!channel?.id) {
      return null;
    }

    return {
      channelId: channel.id,
      title: channel.snippet?.title ?? "YouTube Channel",
      description: channel.snippet?.description ?? "",
      totalViews: Number(channel.statistics?.viewCount ?? 0),
      subscriberCount:
        typeof channel.statistics?.subscriberCount === "string"
          ? Number(channel.statistics.subscriberCount)
          : null,
      totalVideos: Number(channel.statistics?.videoCount ?? 0),
      rawPayload: JSON.parse(JSON.stringify(channel)) as Record<string, unknown>
    };
  }

  async getChannelDailyAnalytics(accountId: string, startDate: string, endDate: string) {
    if (this.shouldUseMock()) {
      return createMockAnalyticsSeries(startDate, endDate);
    }

    await this.assertAnalyticsScope(accountId);
    const client = await this.ensureFresh(accountId, 30);
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth: client });
    const response = await youtubeAnalytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,likes,comments,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day"
    });

    return parseDailyAnalyticsRows(response.data);
  }

  async listPublicChannelVideos(accountId: string, externalChannelId: string, maxResults = 12): Promise<YouTubePublicVideo[]> {
    if (this.shouldUseMock()) {
      return createMockPublicVideos(externalChannelId, maxResults);
    }

    const client = await this.ensureFresh(accountId, 30);
    const youtube = google.youtube({ version: "v3", auth: client });
    const channelResponse = await youtube.channels.list({
      id: [externalChannelId],
      part: ["contentDetails"]
    });

    const uploadsPlaylistId =
      channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return [];
    }

    const playlistItems = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ["contentDetails"],
      maxResults
    });

    const videoIds =
      playlistItems.data.items
        ?.map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];

    if (videoIds.length === 0) {
      return [];
    }

    const videosResponse = await youtube.videos.list({
      id: videoIds,
      part: ["snippet", "contentDetails", "statistics"]
    });

    return (
      videosResponse.data.items
        ?.map((video) => {
          if (!video.id) {
            return null;
          }

          const rawPayload = JSON.parse(JSON.stringify(video)) as Record<string, unknown>;
          return {
            externalVideoId: video.id,
            title: video.snippet?.title ?? "Untitled",
            description: video.snippet?.description ?? "",
            publishedAt: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
            durationSeconds: parseIsoDurationToSeconds(video.contentDetails?.duration ?? undefined),
            tags: video.snippet?.tags ?? [],
            views: Number(video.statistics?.viewCount ?? 0),
            likes: Number(video.statistics?.likeCount ?? 0),
            comments: Number(video.statistics?.commentCount ?? 0),
            rawPayload
          } satisfies YouTubePublicVideo;
        })
        .filter((video): video is YouTubePublicVideo => Boolean(video)) ?? []
    );
  }

  async getPublicChannelStatistics(accountId: string, externalChannelId: string): Promise<YouTubePublicChannelStatistics | null> {
    if (this.shouldUseMock()) {
      return {
        channelId: externalChannelId,
        title: `Competitor ${externalChannelId.slice(0, 4)}`,
        description: "Mock public competitor channel.",
        subscriberCount: 52_000,
        totalVideos: 214,
        totalViews: 3_400_000,
        rawPayload: { mock: true }
      };
    }

    const client = await this.ensureFresh(accountId, 30);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.channels.list({
      id: [externalChannelId],
      part: ["snippet", "statistics"]
    });

    const channel = response.data.items?.[0];
    if (!channel?.id) {
      return null;
    }

    return {
      channelId: channel.id,
      title: channel.snippet?.title ?? "Unknown channel",
      description: channel.snippet?.description ?? "",
      subscriberCount:
        typeof channel.statistics?.subscriberCount === "string"
          ? Number(channel.statistics.subscriberCount)
          : null,
      totalVideos:
        typeof channel.statistics?.videoCount === "string"
          ? Number(channel.statistics.videoCount)
          : null,
      totalViews:
        typeof channel.statistics?.viewCount === "string"
          ? Number(channel.statistics.viewCount)
          : null,
      rawPayload: JSON.parse(JSON.stringify(channel)) as Record<string, unknown>
    };
  }

  async publish(decisionId: string) {
    const decision = await this.prisma.distributionDecision.findUnique({
      where: { id: decisionId },
      include: {
        metadataVariant: true,
        connectedAccount: true,
        post: true,
        campaignWave: {
          include: {
            campaign: {
              include: {
                asset: {
                  include: {
                    files: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!decision || !decision.connectedAccount || !decision.metadataVariant) {
      throw new NotFoundError("Distribution decision is incomplete.");
    }

    if (this.shouldUseMock()) {
      return this.publishMock(decisionId);
    }

    const client = await this.ensureFresh(decision.connectedAccount.id);
    const youtube = google.youtube({ version: "v3", auth: client });
    const asset = decision.campaignWave.campaign.asset;
    const file = asset.files[0];

    if (!file) {
      throw new NotFoundError("Asset file is missing.");
    }

    const media = await this.storage.getObjectStream(file.storageKey);
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: decision.metadataVariant.title,
          description: `${decision.metadataVariant.hook}\n\n${decision.metadataVariant.caption}\n\n${(decision.metadataVariant.hashtags as string[]).join(" ")}`,
          tags: decision.metadataVariant.keywords as string[],
          categoryId: "22"
        },
        status: {
          privacyStatus: decision.scheduledFor > new Date() ? "private" : "public",
          publishAt: decision.scheduledFor > new Date() ? decision.scheduledFor.toISOString() : undefined,
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: media
      }
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error("YouTube publish did not return a video id.");
    }

    const externalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const post = await this.prisma.platformPost.upsert({
      where: { decisionId },
      update: {
        externalPostId: videoId,
        externalUrl,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        nextPollAt: new Date(Date.now() + 5 * 60 * 1000)
      },
      create: {
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        decisionId,
        connectedAccountId: decision.connectedAccountId,
        platform: Platform.YOUTUBE,
        externalPostId: videoId,
        externalUrl,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        nextPollAt: new Date(Date.now() + 5 * 60 * 1000)
      }
    });

    await this.audit.log({
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      eventType: "youtube.publish_succeeded",
      targetType: "POST",
      targetId: post.id,
      payload: { videoId, externalUrl }
    });

    return post;
  }

  async publishMock(decisionId: string) {
    const decision = await this.prisma.distributionDecision.findUnique({
      where: { id: decisionId },
      include: {
        campaignWave: {
          include: {
            campaign: {
              include: {
                asset: true
              }
            }
          }
        }
      }
    });

    if (!decision) {
      throw new NotFoundError("Decision not found.");
    }

    const mockVideoId = `mock-${decision.id.slice(0, 10)}`;
    return this.prisma.platformPost.upsert({
      where: { decisionId },
      update: {
        externalPostId: mockVideoId,
        externalUrl: `https://youtube.local/watch?v=${mockVideoId}`,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        nextPollAt: new Date(Date.now() + 5 * 60 * 1000)
      },
      create: {
        workspaceId: decision.campaignWave.campaign.asset.workspaceId,
        assetId: decision.campaignWave.campaign.asset.id,
        decisionId,
        connectedAccountId: decision.connectedAccountId,
        platform: Platform.YOUTUBE,
        externalPostId: mockVideoId,
        externalUrl: `https://youtube.local/watch?v=${mockVideoId}`,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        nextPollAt: new Date(Date.now() + 5 * 60 * 1000)
      }
    });
  }

  async refreshMetrics(postIds: string[]) {
    const posts = await this.prisma.platformPost.findMany({
      where: {
        id: { in: postIds },
        platform: Platform.YOUTUBE
      }
    });

    if (posts.length === 0) {
      return [];
    }

    const accountId = posts[0]?.connectedAccountId;
    const externalIds = posts.map((post) => post.externalPostId).filter(Boolean) as string[];

    if (!accountId || externalIds.length === 0 || this.shouldUseMock()) {
      if (!this.shouldUseMock()) {
        return [];
      }

      return posts.map((post) => ({
        postId: post.id,
        metrics: {
          views: 100 + post.pollCount * 25,
          likes: 10 + post.pollCount * 3,
          comments: 2 + post.pollCount
        }
      }));
    }

    const client = await this.ensureFresh(accountId);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.videos.list({
      part: ["statistics"],
      id: externalIds
    });

    const metricMap = new Map<string, youtube_v3.Schema$Video>();
    response.data.items?.forEach((item) => {
      if (item.id) {
        metricMap.set(item.id, item);
      }
    });

    return posts.map((post) => {
      const video = post.externalPostId ? metricMap.get(post.externalPostId) : undefined;
      return {
        postId: post.id,
        metrics: {
          views: Number(video?.statistics?.viewCount ?? 0),
          likes: Number(video?.statistics?.likeCount ?? 0),
          comments: Number(video?.statistics?.commentCount ?? 0)
        }
      };
    });
  }

  async listOwnChannelVideos(accountId: string, maxResults = 50): Promise<YouTubeChannelVideo[]> {
    if (this.shouldUseMock()) {
      return [];
    }

    const client = await this.ensureFresh(accountId, 30);
    const youtube = google.youtube({ version: "v3", auth: client });
    const channelResponse = await youtube.channels.list({
      mine: true,
      part: ["contentDetails"]
    });
    const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return [];
    }

    const playlistItems = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ["snippet", "contentDetails"],
      maxResults
    });

    const videoIds = playlistItems.data.items
      ?.map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];

    if (videoIds.length === 0) {
      return [];
    }

    const videosResponse = await youtube.videos.list({
      id: videoIds,
      part: ["snippet", "contentDetails", "statistics"]
    });

    return (
      videosResponse.data.items?.map((video) => {
        const rawPayload = JSON.parse(JSON.stringify(video)) as Record<string, unknown>;
        return {
          externalVideoId: video.id ?? "",
          title: video.snippet?.title ?? "Untitled",
          description: video.snippet?.description ?? "",
          publishedAt: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
          durationSeconds: parseIsoDurationToSeconds(video.contentDetails?.duration ?? undefined),
          tags: video.snippet?.tags ?? [],
          rawPayload
        };
      }).filter((video) => video.externalVideoId.length > 0) ?? []
    );
  }

  async getVideoMetrics(accountId: string, externalVideoIds: string[]) {
    if (externalVideoIds.length === 0) {
      return [];
    }

    if (this.shouldUseMock()) {
      return [];
    }

    const client = await this.ensureFresh(accountId, 30);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.videos.list({
      part: ["statistics"],
      id: externalVideoIds
    });

    return (
      response.data.items?.map((item) => ({
        externalVideoId: item.id ?? "",
        views: Number(item.statistics?.viewCount ?? 0),
        likes: Number(item.statistics?.likeCount ?? 0),
        comments: Number(item.statistics?.commentCount ?? 0),
        rawMetrics: JSON.parse(JSON.stringify(item.statistics ?? {})) as Record<string, unknown>
      })).filter((item) => item.externalVideoId.length > 0) ?? []
    );
  }

  async hasAnalyticsAccess(accountId: string) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return false;
    }

    return hasYouTubeAnalyticsScope(account.scopes);
  }

  private async assertAnalyticsScope(accountId: string) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.platform !== Platform.YOUTUBE) {
      throw new NotFoundError("YouTube account not found.");
    }

    if (!hasYouTubeAnalyticsScope(account.scopes)) {
      throw new AuthError("Reconnect YouTube to grant analytics access.");
    }

    return account;
  }

  private shouldUseMock() {
    const credentialsConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
    return canUseYouTubeMock({
      credentialsConfigured,
      allowMock: env.YOUTUBE_ALLOW_MOCK,
      nodeEnv: env.NODE_ENV
    });
  }
}

function parseDailyAnalyticsRows(
  payload: {
    columnHeaders?: Array<{ name?: string | null }>;
    rows?: unknown[][] | null;
  } | null | undefined
): YouTubeChannelAnalyticsPoint[] {
  const headers = payload?.columnHeaders?.map((header) => header.name ?? "") ?? [];
  const rows = payload?.rows ?? [];

  return rows
    .map((row) => {
      const record = new Map(headers.map((header, index) => [header, row[index]] as const));
      const day = record.get("day");
      if (typeof day !== "string") {
        return null;
      }

      return {
        day: new Date(`${day}T00:00:00.000Z`),
        views: toNumber(record.get("views")),
        likes: toNumber(record.get("likes")),
        comments: toNumber(record.get("comments")),
        watchTimeMinutes: toNumber(record.get("estimatedMinutesWatched"))
      } satisfies YouTubeChannelAnalyticsPoint;
    })
    .filter((row): row is YouTubeChannelAnalyticsPoint => Boolean(row));
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function parseIsoDurationToSeconds(duration: string | undefined): number | null {
  if (!duration) {
    return null;
  }

  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) {
    return null;
  }

  const hours = Number(matches[1] ?? 0);
  const minutes = Number(matches[2] ?? 0);
  const seconds = Number(matches[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function createMockAnalyticsSeries(startDate: string, endDate: string): YouTubeChannelAnalyticsPoint[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  return eachDayOfInterval({ start, end }).map((day, index) => ({
    day,
    views: 1200 + index * 135,
    likes: 90 + index * 7,
    comments: 18 + index * 2,
    watchTimeMinutes: 480 + index * 40
  }));
}

function createMockPublicVideos(externalChannelId: string, maxResults: number): YouTubePublicVideo[] {
  return Array.from({ length: Math.min(6, maxResults) }, (_, index) => {
    const publishedAt = subDays(new Date(), index);
    const views = 18_000 - index * 1700;
    return {
      externalVideoId: `${externalChannelId}-video-${index + 1}`,
      title: `Competitor video ${index + 1}`,
      description: "Mock competitor video for local development.",
      publishedAt,
      durationSeconds: 42 + index * 9,
      tags: ["growth", "youtube", "creator"],
      views,
      likes: Math.round(views * 0.06),
      comments: Math.round(views * 0.008),
      rawPayload: { mock: true, index }
    };
  });
}

export function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) {
    return scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0);
  }

  if (typeof scopes === "string") {
    return scopes
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  return [];
}

export function hasYouTubeAnalyticsScope(scopes: unknown) {
  return normalizeScopes(scopes).includes(YOUTUBE_ANALYTICS_SCOPE);
}

export function canUseYouTubeMock(input: { credentialsConfigured: boolean; allowMock: boolean; nodeEnv: string }) {
  return !input.credentialsConfigured && input.allowMock && input.nodeEnv !== "production";
}
