import { extname } from "node:path";

import { ValidationStatus, type PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import type { StorageService } from "../lib/storage.js";
import { ValidationError } from "../lib/errors.js";
import { probeVideoBuffer } from "../lib/ffprobe.js";
import { AuditService } from "./audit-service.js";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export class AssetValidationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  async inspect(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        files: true,
        workspace: true
      }
    });

    if (!asset || asset.files.length === 0) {
      throw new ValidationError("Asset is missing an uploaded file.");
    }

    const file = asset.files[0];
    if (!file) {
      throw new ValidationError("Asset is missing an uploaded file.");
    }

    try {
      const extension = extname(file.fileName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new ValidationError("Unsupported video format.", { extension });
      }

      const head = await this.storage.headObject(file.storageKey);
      if (head.contentLength <= 0 || head.contentLength > env.MAX_VIDEO_BYTES) {
        throw new ValidationError("Video exceeds Axora's MVP size limit.", {
          fileSizeBytes: head.contentLength
        });
      }

      const sniffed = await this.storage.sniffMimeType(file.storageKey);
      if (!sniffed?.mime.startsWith("video/")) {
        throw new ValidationError("Uploaded file is not a video.", {
          sniffedMimeType: sniffed?.mime ?? "unknown"
        });
      }

      const buffer = await this.storage.getObjectBuffer(file.storageKey);
      const probed = await probeVideoBuffer(buffer, file.fileName);

      if (probed.durationSeconds > env.MAX_VIDEO_DURATION_SECONDS) {
        throw new ValidationError("Video exceeds Axora's MVP duration limit.", {
          durationSeconds: probed.durationSeconds
        });
      }

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: "READY",
          rejectionReason: null,
          files: {
            update: {
              where: { id: file.id },
              data: {
                sniffedMimeType: sniffed.mime,
                fileSizeBytes: head.contentLength,
                durationSeconds: probed.durationSeconds,
                width: probed.width,
                height: probed.height,
                fps: probed.fps,
                bitrate: probed.bitrate,
                orientation: probed.orientation,
                hasAudio: probed.hasAudio,
                validationStatus: ValidationStatus.VALID
              }
            }
          }
        }
      });

      await this.audit.log({
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        eventType: "asset.validated",
        targetType: "ASSET",
        targetId: asset.id,
        payload: {
          durationSeconds: probed.durationSeconds,
          sniffedMimeType: sniffed.mime
        }
      });

      return probed;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Asset validation failed.";
      await this.storage.deleteObject(file.storageKey).catch(() => undefined);
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          files: {
            update: {
              where: { id: file.id },
              data: {
                validationStatus: ValidationStatus.REJECTED
              }
            }
          }
        }
      });

      await this.audit.log({
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        eventType: "asset.rejected",
        targetType: "ASSET",
        targetId: asset.id,
        payload: { reason }
      });

      throw error;
    }
  }
}
