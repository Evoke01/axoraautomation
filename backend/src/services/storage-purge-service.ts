import { type PrismaClient } from "@prisma/client";
import { subDays, subHours } from "date-fns";
import type { StorageService } from "../lib/storage.js";

export class StoragePurgeService {
  private lastSweepByWorkspace = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService
  ) {}

  async sweepWorkspace(workspaceId: string) {
    const now = Date.now();
    const lastSweep = this.lastSweepByWorkspace.get(workspaceId) ?? 0;
    
    // Only sweep at most once per 6 hours per workspace to save DB/CPU overhead
    // on high traffic paths.
    if (now - lastSweep < 6 * 60 * 60 * 1000) {
      return;
    }
    
    this.lastSweepByWorkspace.set(workspaceId, now);

    try {
      await this.purgeAbandonedUploads(workspaceId);
      await this.purgeOutdatedAssets(workspaceId);
    } catch (error) {
      console.error(`Storage purge failed for workspace ${workspaceId}:`, error);
    }
  }

  private async purgeAbandonedUploads(workspaceId: string) {
    const threshold = subHours(new Date(), 24);

    const abandoned = await this.prisma.uploadSession.findMany({
      where: {
        workspaceId,
        status: { in: ["INITIATED", "UPLOADING"] },
        createdAt: { lt: threshold }
      }
    });

    for (const session of abandoned) {
      try {
        await this.storage.deleteObject(session.objectKey).catch(() => undefined);
        await this.prisma.uploadSession.update({
          where: { id: session.id },
          data: { status: "ABORTED" }
        });
      } catch (err) {
        console.error(`Failed to purge upload session ${session.id}`, err);
      }
    }
  }

  private async purgeOutdatedAssets(workspaceId: string) {
    const threshold = subDays(new Date(), 14);

    // 1. Files older than 14 days (hard cutoff to prevent free tier bloat)
    const outdatedFiles = await this.prisma.assetFile.findMany({
      where: {
        createdAt: { lt: threshold },
        asset: { workspaceId }
      }
    });

    for (const file of outdatedFiles) {
      try {
        await this.storage.deleteObject(file.storageKey).catch(() => undefined);
        await this.prisma.assetFile.delete({
          where: { id: file.id }
        });
      } catch (err) {
        console.error(`Failed to purge outdated asset file ${file.id}`, err);
      }
    }
    
    // 2. Immediate cleanup for Failed / Rejected / Archived assets
    const deadStatusFiles = await this.prisma.assetFile.findMany({
      where: {
        asset: {
          workspaceId,
          status: { in: ["FAILED", "REJECTED", "ARCHIVED"] }
        }
      }
    });

    for (const file of deadStatusFiles) {
      try {
        await this.storage.deleteObject(file.storageKey).catch(() => undefined);
        await this.prisma.assetFile.delete({
          where: { id: file.id }
        });
      } catch (err) {
        console.error(`Failed to purge dead status asset file ${file.id}`, err);
      }
    }
  }
}
