import { describe, expect, it } from "vitest";

import { OptimizationService } from "../src/services/optimization-service.js";

describe("OptimizationService", () => {
  it("selects a second-wave metadata refresh for underperforming posts after 24h", () => {
    const service = new OptimizationService({} as any);
    expect(
      service.pickSecondWaveAction({
        hoursSincePublish: 26,
        views: 80,
        baselineViews: 300
      })
    ).toBe("regenerate_metadata");
  });

  it("archives heavily underperforming posts after 72h", () => {
    const service = new OptimizationService({} as any);
    expect(
      service.pickSecondWaveAction({
        hoursSincePublish: 80,
        views: 20,
        baselineViews: 250
      })
    ).toBe("archive");
  });
});
