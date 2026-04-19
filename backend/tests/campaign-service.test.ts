import { describe, expect, it, vi } from "vitest";

import { CampaignService } from "../src/services/campaign-service.js";

function buildDecision() {
  return {
    id: "decision_1",
    connectedAccountId: "account_1",
    scheduledFor: new Date(Date.now() + 60_000),
    createdAt: new Date()
  };
}

describe("CampaignService", () => {
  it("holds assets for review when the current plan requires approval", async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asset_1",
          workspace: {
            entitlements: {
              manualReviewRequired: true
            }
          },
          campaigns: [
            {
              waves: [
                {
                  decisions: [buildDecision()]
                }
              ]
            }
          ]
        }),
        update: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const queue = { add: vi.fn() } as any;
    const audit = { log: vi.fn() } as any;
    const agents = { recommendSchedule: vi.fn() } as any;
    const service = new CampaignService(prisma, queue, audit, agents);

    const result = await service.evaluateReviewGate("asset_1");

    expect(result.status).toBe("pending_review");
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_REVIEW"
        })
      })
    );
  });

  it("schedules autopublish when approval is not required", async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asset_1",
          workspace: {
            entitlements: {
              manualReviewRequired: false
            }
          },
          campaigns: [
            {
              waves: [
                {
                  decisions: [buildDecision()]
                }
              ]
            }
          ]
        }),
        update: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const queue = { add: vi.fn().mockResolvedValue(undefined) } as any;
    const audit = { log: vi.fn() } as any;
    const agents = { recommendSchedule: vi.fn() } as any;
    const service = new CampaignService(prisma, queue, audit, agents);

    const result = await service.evaluateReviewGate("asset_1");

    expect(result.status).toBe("scheduled");
    expect(queue.add).toHaveBeenCalledWith(
      "publish.execute",
      { decisionId: "decision_1" },
      expect.objectContaining({ delay: expect.any(Number) })
    );
  });
});
