import { describe, expect, it, vi } from "vitest";

import { scheduleLearningCheckpointJobs } from "../src/queues/runtime.js";
import { LearningService, buildCreatorProfilePack, summarizeCreatorProfile } from "../src/services/learning-service.js";

describe("learning checkpoints", () => {
  it("schedules exactly four milestone jobs after publish", async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    await scheduleLearningCheckpointJobs(
      { queue } as any,
      "post_1",
      new Date("2026-04-01T10:00:00.000Z")
    );

    expect(queue.add).toHaveBeenCalledTimes(4);
    expect(queue.add.mock.calls.map((call) => call[1].checkpointKey)).toEqual(["H24", "H72", "D7", "D30"]);
  });

  it("skips capture when the checkpoint already exists", async () => {
    const prisma = {
      platformPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: "post_1",
          platform: "YOUTUBE",
          status: "PUBLISHED",
          connectedAccountId: "acct_1",
          externalPostId: "video_1",
          publishedAt: new Date("2026-04-01T10:00:00.000Z"),
          asset: {
            creatorId: "creator_1"
          }
        })
      },
      postPerformanceCheckpoint: {
        findUnique: vi.fn().mockResolvedValue({
          id: "cp_1",
          status: "CAPTURED"
        })
      }
    } as any;

    const youtube = {
      getVideoLearningMetrics: vi.fn()
    } as any;

    const service = new LearningService(prisma, youtube);
    const result = await service.captureCheckpoint("post_1", "H24");

    expect(result).toEqual({ status: "skipped" });
    expect(youtube.getVideoLearningMetrics).not.toHaveBeenCalled();
  });
});

describe("creator learning profile", () => {
  it("builds an auto-applying profile pack once checkpoint and post thresholds are met", async () => {
    const prisma = {
      creator: {
        findUnique: vi.fn().mockResolvedValue({
          id: "creator_1",
          workspace: { timezone: "UTC" },
          learningProfile: { lastSynthesizedCheckpointCount: 6 }
        })
      },
      platformPost: {
        findMany: vi.fn().mockResolvedValue([
          buildPublishedPost("post_1", "7 mistakes founders make?", "Mon", "curiosity", 0.081, 12000, 54, [
            { checkpointKey: "H24", ctr: 0.076 },
            { checkpointKey: "D7", ctr: 0.081 }
          ]),
          buildPublishedPost("post_2", "5 creator myths you should stop believing", "Mon", "authority", 0.078, 9800, 51, [
            { checkpointKey: "H24", ctr: 0.071 },
            { checkpointKey: "D7", ctr: 0.078 }
          ]),
          buildPublishedPost("post_3", "Growth levers nobody talks about", "Thu", "authority", 0.052, 8700, 49, [
            { checkpointKey: "H72", ctr: 0.047 },
            { checkpointKey: "D7", ctr: 0.052 }
          ])
        ])
      },
      creatorLearningProfile: {
        upsert: vi.fn().mockImplementation(async (args) => args.create)
      }
    } as any;

    const service = new LearningService(prisma, {} as any);
    const profile = await service.recomputeCreatorProfile("creator_1");
    const pack = buildCreatorProfilePack(profile);
    const titleWeights = Array.isArray(profile.titlePatternWeights) ? profile.titlePatternWeights as Array<{ key: string }> : [];

    expect(profile.sampleSize).toBe(6);
    expect(titleWeights.map((item) => item.key)).toContain("number_led");
    expect(pack.bestPublishWindows.length).toBeGreaterThan(0);
    expect(summarizeCreatorProfile(profile).sampleSize).toBe(6);
  });

  it("keeps high-confidence auto-apply rules in the compact profile pack", () => {
    const pack = buildCreatorProfilePack({
      titlePatternWeights: [
        { key: "number_led", ctrLift: 0.031, confidence: 0.74, sampleSize: 6, distinctPosts: 3, avgCtr: 0.081, avgScore: 0.12, autoApply: true }
      ],
      publishTimeWeights: [
        { key: "mon_evening", ctrLift: 0.022, confidence: 0.71, sampleSize: 6, distinctPosts: 3, avgCtr: 0.079, avgScore: 0.1, autoApply: true }
      ],
      thumbnailStyleWeights: [],
      keywordWeights: [],
      angleWeights: [],
      summary: {
        recommendedPublishWindows: ["mon_evening"]
      },
      sampleSize: 6,
      confidence: 0.78,
      lastLearnedAt: new Date("2026-04-01T10:00:00.000Z")
    });

    expect(pack.bestTitlePatterns).toContain("number_led");
    expect(pack.bestPublishWindows).toEqual(["mon_evening"]);
  });

  it("drops low-confidence advisory noise from the profile pack", () => {
    const pack = buildCreatorProfilePack({
      titlePatternWeights: [
        { key: "question", ctrLift: 0.04, confidence: 0.45, sampleSize: 1, distinctPosts: 1, avgCtr: 0.05, avgScore: 0.02, autoApply: false }
      ],
      publishTimeWeights: [],
      thumbnailStyleWeights: [],
      keywordWeights: [],
      angleWeights: [],
      sampleSize: 1,
      confidence: 0.2,
      lastLearnedAt: new Date("2026-04-01T10:00:00.000Z")
    });

    expect(pack.bestTitlePatterns).toEqual([]);
    expect(pack.bestPublishWindows).toEqual([]);
  });
});

function buildPublishedPost(
  id: string,
  title: string,
  day: "Mon" | "Thu",
  angle: "curiosity" | "authority",
  ctr: number,
  impressions: number,
  averageViewPercentage: number,
  checkpoints: Array<{ checkpointKey: "H24" | "H72" | "D7"; ctr: number }>
) {
  const publishedAt = day === "Mon"
    ? new Date("2026-04-06T18:00:00.000Z")
    : new Date("2026-04-09T18:00:00.000Z");

  return {
    id,
    publishedAt,
    asset: { title },
    decision: {
      metadataVariant: {
        title,
        thumbnailBrief: angle === "authority" ? "Clean expert framing with one proof point." : "Curiosity-led text with one unresolved promise.",
        keywords: ["growth", "creator", "youtube"],
        hashtags: ["growth", "creator"],
        angle
      }
    },
    performanceCheckpoints: checkpoints.map((checkpoint, index) => ({
      checkpointKey: checkpoint.checkpointKey,
      ctr: checkpoint.ctr,
      impressions,
      views: Math.round(impressions * checkpoint.ctr),
      estimatedMinutesWatched: 420 + index * 35,
      averageViewDuration: 48 + index * 4,
      averageViewPercentage,
      capturedAt: new Date("2026-04-10T10:00:00.000Z")
    }))
  };
}
