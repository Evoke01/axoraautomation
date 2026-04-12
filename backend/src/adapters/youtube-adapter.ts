import { randomBytes } from "node:crypto";

import { google, type youtube_v3 } from "googleapis";
import { ConnectedAccountStatus, Platform, PostStatus, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { decryptValue, encryptValue } from "../lib/crypto.js";
import { AuthError, NotFoundError } from "../lib/errors.js";
import type { StorageService } from "../lib/storage.js";
import { AuditService } from "../services/audit-service.js";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly"
];

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
      part: ["snippet"]
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

    const data = {
      accountLabel,
      status: ConnectedAccountStatus.ACTIVE,
      externalAccountId: channelId,
      accessTokenEncrypted: tokens.access_token ? encryptValue(tokens.access_token) : existing?.accessTokenEncrypted,
      refreshTokenEncrypted: tokens.refresh_token ? encryptValue(tokens.refresh_token) : existing?.refreshTokenEncrypted,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.tokenExpiresAt,
      scopes: YOUTUBE_SCOPES,
      metadata: {
        channelTitle: accountLabel
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
      payload: { channelId, accountLabel }
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

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
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
        nextPollAt: new Date(Date.now() + 30 * 60 * 1000)
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
        nextPollAt: new Date(Date.now() + 30 * 60 * 1000)
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
        nextPollAt: new Date(Date.now() + 30 * 60 * 1000)
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
        nextPollAt: new Date(Date.now() + 30 * 60 * 1000)
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

    if (!accountId || externalIds.length === 0 || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
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
}
