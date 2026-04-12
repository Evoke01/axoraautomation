import { describe, expect, it, vi } from "vitest";
import { Platform } from "@prisma/client";

import { QuotaExceededError } from "../src/lib/errors.js";
import { QuotaService } from "../src/services/quota-service.js";

describe("QuotaService", () => {
  it("blocks publishes that would consume the daily buffer", async () => {
    const prisma = {
      connectedAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: "account_1",
          workspaceId: "workspace_1"
        })
      },
      platformQuotaLedger: {
        upsert: vi.fn().mockResolvedValue({
          id: "ledger_1",
          usedUnits: 7900,
          reservedUnits: 100,
          dailyLimit: 10000,
          safetyBuffer: 2000
        })
      }
    } as any;

    const service = new QuotaService(prisma);

    await expect(service.reserve(Platform.YOUTUBE, "account_1", 150)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });
});
