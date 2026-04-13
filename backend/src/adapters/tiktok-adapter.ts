import { createHash, randomBytes } from "node:crypto";

import { ConnectedAccountStatus, Platform, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { decryptValue, encryptValue } from "../lib/crypto.js";
import { AuthError, NotFoundError } from "../lib/errors.js";
import { AuditService } from "../services/audit-service.js";

const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

export class TikTokAdapter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService
  ) {}

  private assertConfigured() {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.TIKTOK_REDIRECT_URI) {
      throw new AuthError("TikTok OAuth credentials are not configured.");
    }
  }

  async getAuthorizationUrl(workspaceId: string) {
    this.assertConfigured();

    const state = randomBytes(24).toString("hex");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    await this.prisma.oAuthState.create({
      data: {
        workspaceId,
        provider: Platform.TIKTOK,
        state,
        codeVerifier,
        redirectUri: env.TIKTOK_REDIRECT_URI!,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    const url = new URL(env.TIKTOK_AUTH_URL);
    url.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY!);
    url.searchParams.set("redirect_uri", env.TIKTOK_REDIRECT_URI!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async handleCallback(state: string, code: string) {
    this.assertConfigured();

    const oauthState = await this.prisma.oAuthState.findUnique({
      where: { state }
    });

    if (!oauthState || oauthState.provider !== Platform.TIKTOK || oauthState.expiresAt < new Date()) {
      throw new AuthError("TikTok OAuth state has expired.");
    }

    if (!oauthState.codeVerifier) {
      throw new AuthError("TikTok OAuth state is missing a PKCE verifier.");
    }

    const token = await postForm<TikTokTokenResponse>(env.TIKTOK_TOKEN_URL, {
      client_key: env.TIKTOK_CLIENT_KEY!,
      client_secret: env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.TIKTOK_REDIRECT_URI!,
      code_verifier: oauthState.codeVerifier
    });

    const accessToken = token.access_token;
    const openId = token.open_id;

    if (!accessToken || !openId) {
      throw new AuthError("TikTok token exchange did not return the expected account identity.");
    }

    const scopes = token.scope?.split(",").map((value) => value.trim()).filter(Boolean) ?? TIKTOK_SCOPES;
    const accessTokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;
    const refreshTokenExpiresAt = token.refresh_expires_in
      ? new Date(Date.now() + token.refresh_expires_in * 1000)
      : null;

    const existing = await this.prisma.connectedAccount.findFirst({
      where: {
        workspaceId: oauthState.workspaceId,
        platform: Platform.TIKTOK,
        externalAccountId: openId
      }
    });

    const accountLabel = `TikTok Creator ${openId.slice(0, 8)}`;
    const account = existing
      ? await this.prisma.connectedAccount.update({
          where: { id: existing.id },
          data: {
            accountLabel,
            status: ConnectedAccountStatus.ACTIVE,
            externalAccountId: openId,
            accessTokenEncrypted: encryptValue(accessToken),
            refreshTokenEncrypted: token.refresh_token
              ? encryptValue(token.refresh_token)
              : existing.refreshTokenEncrypted,
            tokenExpiresAt: accessTokenExpiresAt,
            scopes,
            metadata: {
              openId,
              refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null
            }
          }
        })
      : await this.prisma.connectedAccount.create({
          data: {
            workspaceId: oauthState.workspaceId,
            platform: Platform.TIKTOK,
            accountLabel,
            status: ConnectedAccountStatus.ACTIVE,
            externalAccountId: openId,
            accessTokenEncrypted: encryptValue(accessToken),
            refreshTokenEncrypted: token.refresh_token ? encryptValue(token.refresh_token) : null,
            tokenExpiresAt: accessTokenExpiresAt,
            scopes,
            metadata: {
              openId,
              refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null
            }
          }
        });

    await this.prisma.oAuthState.delete({ where: { id: oauthState.id } });

    await this.audit.log({
      workspaceId: oauthState.workspaceId,
      eventType: "tiktok.account_connected",
      targetType: "ACCOUNT",
      targetId: account.id,
      payload: { openId, scopes }
    });

    return account;
  }

  async ensureFresh(accountId: string, minTtlMinutes = 15) {
    this.assertConfigured();

    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.platform !== Platform.TIKTOK) {
      throw new NotFoundError("TikTok account not found.");
    }

    const accessToken = account.accessTokenEncrypted ? decryptValue(account.accessTokenEncrypted) : undefined;
    const refreshToken = account.refreshTokenEncrypted
      ? decryptValue(account.refreshTokenEncrypted)
      : undefined;
    const expiringSoon =
      !account.tokenExpiresAt ||
      account.tokenExpiresAt.getTime() - Date.now() <= minTtlMinutes * 60 * 1000;

    if (!refreshToken && (!accessToken || expiringSoon)) {
      await this.markReauthRequired(account.id);
      throw new AuthError("TikTok account requires reauthentication.");
    }

    if (!expiringSoon || !refreshToken) {
      return accessToken ?? "";
    }

    const token = await postForm<TikTokTokenResponse>(env.TIKTOK_TOKEN_URL, {
      client_key: env.TIKTOK_CLIENT_KEY!,
      client_secret: env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });

    if (!token.access_token) {
      await this.markReauthRequired(account.id);
      throw new AuthError("TikTok refresh did not return a new access token.");
    }

    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        status: ConnectedAccountStatus.ACTIVE,
        accessTokenEncrypted: encryptValue(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? encryptValue(token.refresh_token)
          : account.refreshTokenEncrypted,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        metadata: {
          ...(typeof account.metadata === "object" && account.metadata ? account.metadata : {}),
          refreshTokenExpiresAt: token.refresh_expires_in
            ? new Date(Date.now() + token.refresh_expires_in * 1000).toISOString()
            : null
        }
      }
    });

    return token.access_token;
  }

  private async markReauthRequired(accountId: string) {
    await this.prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        status: ConnectedAccountStatus.REAUTH_REQUIRED
      }
    });
  }
}

async function postForm<T>(url: string, payload: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache"
    },
    body: new URLSearchParams(payload).toString()
  });

  const bodyText = await response.text();
  const body = bodyText ? safeJsonParse(bodyText) : null;

  if (!response.ok) {
    throw new AuthError(extractMessage(body) ?? "TikTok OAuth request failed.");
  }

  return (body ?? {}) as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMessage(body: Record<string, unknown> | null) {
  if (typeof body?.message === "string") {
    return body.message;
  }

  if (typeof body?.error_description === "string") {
    return body.error_description;
  }

  if (typeof body?.error === "string") {
    return body.error;
  }

  return null;
}
