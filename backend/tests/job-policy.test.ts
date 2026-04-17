import { describe, expect, it } from "vitest";

import { canUseYouTubeMock } from "../src/adapters/youtube-adapter.js";
import { getJobPolicy, buildJobId } from "../src/queues/job-policy.js";
import { JobName } from "../src/queues/names.js";
import { uploadCompleteSchema } from "../src/types/domain.js";

describe("job policy", () => {
  it("provides retry policy for critical jobs", () => {
    const policy = getJobPolicy(JobName.PublishExecute);
    expect(policy.attempts).toBeGreaterThan(1);
    expect(policy.backoff).toBeDefined();
  });

  it("builds deterministic job ids", () => {
    expect(buildJobId(JobName.AssetIngest, "asset-1")).toBe("asset.ingest:asset-1");
  });
});

describe("upload complete contract", () => {
  it("accepts legacy S3 multipart key casing", () => {
    const parsed = uploadCompleteSchema.parse({
      uploadSessionId: "up-1",
      parts: [{ ETag: "abc", PartNumber: 1 }]
    });
    expect(parsed.parts[0]).toEqual({ etag: "abc", partNumber: 1 });
  });
});

describe("youtube mock guard", () => {
  it("never allows mock mode in production", () => {
    expect(
      canUseYouTubeMock({ credentialsConfigured: false, allowMock: true, nodeEnv: "production" })
    ).toBe(false);
  });
});
