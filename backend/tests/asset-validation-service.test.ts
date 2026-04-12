import { describe, expect, it, vi } from "vitest";

import { AssetValidationService } from "../src/services/asset-validation-service.js";

describe("AssetValidationService", () => {
  it("rejects non-supported video extensions before downstream processing", async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asset_1",
          workspaceId: "workspace_1",
          files: [
            {
              id: "file_1",
              fileName: "notes.txt",
              storageKey: "uploads/file.txt"
            }
          ]
        }),
        update: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const storage = {
      deleteObject: vi.fn().mockResolvedValue(undefined)
    } as any;

    const audit = {
      log: vi.fn().mockResolvedValue(undefined)
    } as any;

    const service = new AssetValidationService(prisma, storage, audit);

    await expect(service.inspect("asset_1")).rejects.toThrow("Unsupported video format.");

    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED"
        })
      })
    );
    expect(storage.deleteObject).toHaveBeenCalledWith("uploads/file.txt");
  });
});
