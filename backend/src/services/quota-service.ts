import { addDays } from "date-fns";
import { Platform, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { QuotaExceededError } from "../lib/errors.js";
import { getPacificQuotaDate } from "../lib/time.js";

export class QuotaService {
  constructor(private readonly prisma: PrismaClient) {}

  async reserve(platform: Platform, connectedAccountId: string, estimatedCost: number) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: connectedAccountId }
    });

    if (!account) {
      throw new Error("Connected account not found for quota reservation.");
    }

    const quotaDay = getPacificQuotaDate();
    const quotaDate = new Date(`${quotaDay}T00:00:00.000Z`);
    const dailyLimit = platform === Platform.YOUTUBE ? env.YOUTUBE_DAILY_QUOTA_LIMIT : 1000;
    const safetyBuffer = platform === Platform.YOUTUBE ? env.YOUTUBE_QUOTA_SAFETY_BUFFER : 100;

    const ledger = await this.prisma.platformQuotaLedger.upsert({
      where: {
        connectedAccountId_platform_quotaDate: {
          connectedAccountId,
          platform,
          quotaDate
        }
      },
      update: {},
      create: {
        workspaceId: account.workspaceId,
        connectedAccountId,
        platform,
        quotaDate,
        dailyLimit,
        safetyBuffer
      }
    });

    const pendingUsage = ledger.usedUnits + ledger.reservedUnits + estimatedCost;
    if (pendingUsage > ledger.dailyLimit - ledger.safetyBuffer) {
      throw new QuotaExceededError(
        "Publishing would exceed the available platform quota.",
        addDays(quotaDate, 1)
      );
    }

    await this.prisma.platformQuotaLedger.update({
      where: { id: ledger.id },
      data: {
        reservedUnits: {
          increment: estimatedCost
        }
      }
    });
  }

  async markUsed(platform: Platform, connectedAccountId: string, units: number) {
    const quotaDay = getPacificQuotaDate();
    const quotaDate = new Date(`${quotaDay}T00:00:00.000Z`);

    await this.prisma.platformQuotaLedger.updateMany({
      where: {
        connectedAccountId,
        platform,
        quotaDate
      },
      data: {
        reservedUnits: {
          decrement: units
        },
        usedUnits: {
          increment: units
        }
      }
    });
  }

  async releaseReservation(platform: Platform, connectedAccountId: string, units: number) {
    const quotaDay = getPacificQuotaDate();
    const quotaDate = new Date(`${quotaDay}T00:00:00.000Z`);

    await this.prisma.platformQuotaLedger.updateMany({
      where: {
        connectedAccountId,
        platform,
        quotaDate
      },
      data: {
        reservedUnits: {
          decrement: units
        }
      }
    });
  }
}
