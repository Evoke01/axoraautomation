import { Platform, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { hasYouTubeAnalyticsScope } from "../adapters/youtube-adapter.js";
import { getPacificQuotaDate } from "../lib/time.js";
import { AuditService } from "./audit-service.js";

const PLATFORM_CATALOG: Record<
  Platform,
  {
    label: string;
    connectable: boolean;
    defaultNote: string;
  }
> = {
  [Platform.YOUTUBE]: {
    label: "YouTube",
    connectable: true,
    defaultNote: "Ready for channel OAuth, uploads, near-real-time metrics, and channel analytics."
  },
  [Platform.INSTAGRAM]: {
    label: "Instagram",
    connectable: true,
    defaultNote:
      "Requires a Professional account and Advanced Access for instagram_business_content_publish."
  },
  [Platform.TIKTOK]: {
    label: "TikTok",
    connectable: true,
    defaultNote: "Requires Content Posting API review approval and Direct Post enabled."
  },
  [Platform.LINKEDIN]: {
    label: "LinkedIn",
    connectable: false,
    defaultNote:
      "Native video publishing remains deferred because the required access is allowlist-gated."
  },
  [Platform.X]: {
    label: "X (Twitter)",
    connectable: false,
    defaultNote:
      "Posting requires a paid API tier, so X is intentionally excluded from MVP automation."
  }
};

export class ConnectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService
  ) {}

  async list(workspaceId: string) {
    const quotaDay = getPacificQuotaDate();
    const quotaDate = new Date(`${quotaDay}T00:00:00.000Z`);

    const accounts = await this.prisma.connectedAccount.findMany({
      where: { workspaceId },
      include: {
        quotaLedgers: {
          where: {
            quotaDate
          }
        }
      },
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }]
    });

    const byPlatform = new Map<Platform, typeof accounts>();
    for (const platform of Object.values(Platform)) {
      byPlatform.set(
        platform,
        accounts.filter((account) => account.platform === platform)
      );
    }

    return Object.values(Platform).map((platform) => {
      const platformAccounts = byPlatform.get(platform) ?? [];
      const preferredAccount =
        platformAccounts.find((account) => account.status === "ACTIVE") ??
        platformAccounts[0] ??
        null;
      const configured = isPlatformConfigured(platform);
      const platformInfo = PLATFORM_CATALOG[platform];
      const quotaLedger = preferredAccount?.quotaLedgers[0];

      return {
        platform,
        label: platformInfo.label,
        connectable: platformInfo.connectable && configured,
        configured,
        connected: Boolean(preferredAccount && preferredAccount.status === "ACTIVE"),
        note: buildPlatformNote(platform, preferredAccount, configured, quotaLedger),
        accounts: platformAccounts.map((account) => ({
          id: account.id,
          accountLabel: account.accountLabel,
          externalAccountId: account.externalAccountId,
          status: account.status,
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          metadata: account.metadata
        }))
      };
    });
  }

  async disconnect(accountId: string, actorId?: string) {
    const existing = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId }
    });

    if (!existing) {
      return null;
    }

    const account = await this.prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        status: "DISCONNECTED",
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null
      }
    });

    await this.audit.log({
      workspaceId: account.workspaceId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      eventType: "connection.disconnected",
      targetType: "ACCOUNT",
      targetId: account.id,
      payload: { platform: account.platform }
    });

    return account;
  }
}

function buildPlatformNote(
  platform: Platform,
  account:
    | {
        status: string;
        tokenExpiresAt: Date | null;
        scopes?: unknown;
      }
    | null,
  configured: boolean,
  quotaLedger?: {
    dailyLimit: number;
    usedUnits: number;
    reservedUnits: number;
  }
) {
  if (!configured && PLATFORM_CATALOG[platform].connectable) {
    return "Missing OAuth credentials in the backend environment.";
  }

  if (!account) {
    return PLATFORM_CATALOG[platform].defaultNote;
  }

  if (account.status === "REAUTH_REQUIRED") {
    return "Connection requires reauthentication before Axora can act on it.";
  }

  if (platform === Platform.YOUTUBE && !hasYouTubeAnalyticsScope((account as { scopes?: unknown }).scopes)) {
    return "Reconnect YouTube to grant Analytics access for channel totals and the intelligence tab.";
  }

  if (platform === Platform.YOUTUBE && quotaLedger) {
    return `Auto-posting enabled - Quota: ${
      quotaLedger.usedUnits + quotaLedger.reservedUnits
    }/${quotaLedger.dailyLimit} units today`;
  }

  if (account.tokenExpiresAt) {
    return `Connection active - Token expires ${account.tokenExpiresAt.toLocaleString()}`;
  }

  if (account.status === "DISCONNECTED") {
    return "Disconnected locally. Reconnect to restore automation.";
  }

  return PLATFORM_CATALOG[platform].defaultNote;
}

function isPlatformConfigured(platform: Platform) {
  switch (platform) {
    case Platform.YOUTUBE:
      return Boolean(
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
      );
    case Platform.INSTAGRAM:
      return Boolean(
        env.INSTAGRAM_CLIENT_ID &&
          env.INSTAGRAM_CLIENT_SECRET &&
          env.INSTAGRAM_REDIRECT_URI
      );
    case Platform.TIKTOK:
      return Boolean(
        env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REDIRECT_URI
      );
    case Platform.LINKEDIN:
    case Platform.X:
      return false;
    default:
      return false;
  }
}
