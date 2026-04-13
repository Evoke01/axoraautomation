import { randomBytes } from "node:crypto";

import { ConnectedAccountStatus, Platform, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { encryptValue } from "../lib/crypto.js";
import { AuthError } from "../lib/errors.js";
import { AuditService } from "../services/audit-service.js";

const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish"
];

type InstagramTokenResponse = {
  access_token?: string;
  expires_in?: number;
  user_id?: string | number;
  error_type?: string;
  error_message?: string;
};

type InstagramProfileResponse = {
  id?: string;
  user_id?: string | number;
  username?: string;
};

export class InstagramAdapter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService
  ) {}

  private assertConfigured() {
    if (!env.INSTAGRAM_CLIENT_ID || !env.INSTAGRAM_CLIENT_SECRET || !env.INSTAGRAM_REDIRECT_URI) {
      throw new AuthError("Instagram OAuth credentials are not configured.");
    }
  }

  async getAuthorizationUrl(workspaceId: string) {
    this.assertConfigured();

    const state = randomBytes(24).toString("hex");
    await this.prisma.oAuthState.create({
      data: {
        workspaceId,
        provider: Platform.INSTAGRAM,
        state,
        redirectUri: env.INSTAGRAM_REDIRECT_URI!,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    const url = new URL(env.INSTAGRAM_AUTH_URL);
    url.searchParams.set("client_id", env.INSTAGRAM_CLIENT_ID!);
    url.searchParams.set("redirect_uri", env.INSTAGRAM_REDIRECT_URI!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async handleCallback(state: string, code: string) {
    this.assertConfigured();

    const oauthState = await this.prisma.oAuthState.findUnique({
      where: { state }
    });

    if (!oauthState || oauthState.provider !== Platform.INSTAGRAM || oauthState.expiresAt < new Date()) {
      throw new AuthError("Instagram OAuth state has expired.");
    }

    const shortLived = await postForm<InstagramTokenResponse>(env.INSTAGRAM_TOKEN_URL, {
      client_id: env.INSTAGRAM_CLIENT_ID!,
      client_secret: env.INSTAGRAM_CLIENT_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: env.INSTAGRAM_REDIRECT_URI!,
      code
    });

    let accessToken = shortLived.access_token;
    let expiresIn = shortLived.expires_in;
    let externalAccountId = stringifyAccountId(shortLived.user_id);

    if (!accessToken) {
      throw new AuthError("Instagram token exchange did not return an access token.");
    }

    try {
      const longLivedUrl = new URL(env.INSTAGRAM_LONG_LIVED_TOKEN_URL);
      longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
      longLivedUrl.searchParams.set("client_secret", env.INSTAGRAM_CLIENT_SECRET!);
      longLivedUrl.searchParams.set("access_token", accessToken);

      const longLived = await getJson<InstagramTokenResponse>(longLivedUrl.toString());
      accessToken = longLived.access_token ?? accessToken;
      expiresIn = longLived.expires_in ?? expiresIn;
    } catch {
      // Keep the short-lived token when long-lived exchange is unavailable.
    }

    let username: string | undefined;
    try {
      const profileUrl = new URL(env.INSTAGRAM_ME_URL);
      if (!profileUrl.searchParams.has("fields")) {
        profileUrl.searchParams.set("fields", "user_id,username");
      }
      profileUrl.searchParams.set("access_token", accessToken);

      const profile = await getJson<InstagramProfileResponse>(profileUrl.toString());
      username = profile.username;
      externalAccountId =
        stringifyAccountId(profile.user_id ?? profile.id) ?? externalAccountId;
    } catch {
      // Leave the label opaque if profile lookup is unavailable.
    }

    const accountLabel = username ? `@${username}` : "Instagram Professional";
    const accountId = externalAccountId ?? `instagram:${oauthState.workspaceId}`;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const existing = await this.prisma.connectedAccount.findFirst({
      where: {
        workspaceId: oauthState.workspaceId,
        platform: Platform.INSTAGRAM,
        externalAccountId: accountId
      }
    });

    const account = existing
      ? await this.prisma.connectedAccount.update({
          where: { id: existing.id },
          data: {
            accountLabel,
            status: ConnectedAccountStatus.ACTIVE,
            externalAccountId: accountId,
            accessTokenEncrypted: encryptValue(accessToken),
            refreshTokenEncrypted: null,
            tokenExpiresAt,
            scopes: INSTAGRAM_SCOPES,
            metadata: {
              username,
              accessStrategy: tokenExpiresAt ? "long_lived_token" : "session_token"
            }
          }
        })
      : await this.prisma.connectedAccount.create({
          data: {
            workspaceId: oauthState.workspaceId,
            platform: Platform.INSTAGRAM,
            accountLabel,
            status: ConnectedAccountStatus.ACTIVE,
            externalAccountId: accountId,
            accessTokenEncrypted: encryptValue(accessToken),
            tokenExpiresAt,
            scopes: INSTAGRAM_SCOPES,
            metadata: {
              username,
              accessStrategy: tokenExpiresAt ? "long_lived_token" : "session_token"
            }
          }
        });

    await this.prisma.oAuthState.delete({ where: { id: oauthState.id } });

    await this.audit.log({
      workspaceId: oauthState.workspaceId,
      eventType: "instagram.account_connected",
      targetType: "ACCOUNT",
      targetId: account.id,
      payload: {
        externalAccountId: accountId,
        username
      }
    });

    return account;
  }
}

async function postForm<T>(url: string, payload: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(payload).toString()
  });

  return parseJsonResponse<T>(response, "Instagram token exchange failed.");
}

async function getJson<T>(url: string) {
  const response = await fetch(url);
  return parseJsonResponse<T>(response, "Instagram profile lookup failed.");
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string) {
  const bodyText = await response.text();
  const body = bodyText ? safeJsonParse(bodyText) : null;

  if (!response.ok) {
    throw new AuthError(extractMessage(body) ?? fallbackMessage);
  }

  return (body ?? {}) as T;
}

function stringifyAccountId(value: string | number | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return undefined;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMessage(body: Record<string, unknown> | null) {
  const error = body?.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  if (typeof body?.error_message === "string") {
    return body.error_message;
  }

  return null;
}
