import { extname } from "node:path";

import { AuditTargetType, type PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import { env } from "../config/env.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { buildJobId, getJobPolicy } from "../queues/job-policy.js";
import { JobName } from "../queues/names.js";
import type { CreateAssetInput, OverrideAssetInput } from "../types/domain.js";
import { AuditService } from "./audit-service.js";

export class AssetService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Queue,
    private readonly audit: AuditService
  ) {}

  async createAsset(input: CreateAssetInput) {
    const upload = await this.prisma.uploadSession.findUnique({
      where: { id: input.uploadSessionId }
    });

    if (!upload || upload.workspaceId !== input.workspaceId) {
      throw new NotFoundError("Upload session was not found.");
    }

    if (upload.status !== "COMPLETED") {
      throw new ValidationError("Upload has not completed yet.");
    }

    const existingAsset = await this.prisma.asset.findFirst({
      where: { uploadSessionId: upload.id },
      include: { files: true }
    });

    if (existingAsset) {
      return existingAsset;
    }

    const asset = await this.prisma.asset.create({
      data: {
        workspaceId: input.workspaceId,
        creatorId: input.creatorId,
        uploadSessionId: upload.id,
        title: input.title,
        rawNotes: input.rawNotes,
        status: "VALIDATING",
        files: {
          create: {
            storageKey: upload.objectKey,
            bucket: env.S3_BUCKET,
            fileName: upload.fileName,
            extension: extname(upload.fileName).toLowerCase() || ".bin",
            originalMimeType: upload.contentType,
            fileSizeBytes: upload.fileSizeBytes
          }
        }
      },
      include: {
        files: true
      }
    });

    try {
      await this.queue.add(JobName.AssetIngest, { assetId: asset.id }, {
        ...getJobPolicy(JobName.AssetIngest),
        jobId: buildJobId(JobName.AssetIngest, asset.id)
      });
    } catch (err) {
      console.error(`[AssetService] Failed to queue ingest for asset ${asset.id}:`, err);
      // We don't throw here to ensure the user gets a success response for the DB record creation.
      // The status VALIDATING will allow retry/manual trigger later.
    }

    await this.audit.log({
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      eventType: "asset.created",
      targetType: AuditTargetType.ASSET,
      targetId: asset.id,
      payload: { uploadSessionId: upload.id }
    });

    return asset;
  }

  async retryAssetIngest(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });

    if (!asset) {
      throw new NotFoundError("Asset not found.");
    }

    if (asset.status !== "VALIDATING" && asset.status !== "REJECTED") {
      throw new ValidationError("Only validating or rejected assets can be retried.");
    }

    // Reset status to VALIDATING if it was REJECTED
    if (asset.status === "REJECTED") {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: "VALIDATING", rejectionReason: null }
      });
    }

    await this.queue.add(JobName.AssetIngest, { assetId: asset.id }, {
      ...getJobPolicy(JobName.AssetIngest),
      jobId: buildJobId(JobName.AssetIngest, asset.id)
    });

    return { success: true };
  }

  async getAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        files: true,
        tags: true,
        metadataVariants: true,
        campaigns: {
          include: {
            waves: {
              include: {
                decisions: {
                  include: {
                    post: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!asset) {
      throw new NotFoundError("Asset was not found.");
    }

    return asset;
  }

  async queuePlan(assetId: string) {
    await this.queue.add(JobName.CampaignPlan, { assetId }, {
      ...getJobPolicy(JobName.CampaignPlan),
      jobId: buildJobId(JobName.CampaignPlan, assetId)
    });
  }

  async recordOverride(assetId: string, input: OverrideAssetInput, userId?: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        campaigns: {
          include: {
            waves: {
              include: {
                decisions: {
                  include: {
                    metadataVariant: true,
                    post: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!asset) {
      throw new NotFoundError("Asset was not found.");
    }

    const latestDecision = asset.campaigns
      .flatMap((campaign) => campaign.waves)
      .flatMap((wave) => wave.decisions)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    if (!latestDecision) {
      throw new ValidationError("Asset has no planned decision to override.");
    }

    if (input.scheduleFor) {
      await this.prisma.distributionDecision.update({
        where: { id: latestDecision.id },
        data: {
          scheduledFor: new Date(input.scheduleFor),
          status: "SCHEDULED"
        }
      });
    }

    if (input.title) {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { title: input.title }
      });
    }

    if ((input.caption || input.title || input.thumbnailBrief) && latestDecision.metadataVariantId) {
      await this.prisma.metadataVariant.update({
        where: { id: latestDecision.metadataVariantId },
        data: {
          ...(input.caption && { caption: input.caption }),
          ...(input.title && { title: input.title }),
          ...(input.thumbnailBrief && { thumbnailBrief: input.thumbnailBrief })
        }
      });
    }

    if (input.archive) {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: "ARCHIVED"
        }
      });
    }

    await this.prisma.override.create({
      data: {
        workspaceId: asset.workspaceId,
        assetId,
        userId,
        overrideType: input.archive ? "ARCHIVE" : input.scheduleFor ? "SCHEDULE" : "CAPTION",
        details: input
      }
    });

    await this.audit.log({
      workspaceId: asset.workspaceId,
      assetId,
      actorType: userId ? "USER" : "SYSTEM",
      actorId: userId,
      eventType: "asset.override_recorded",
      targetType: AuditTargetType.ASSET,
      targetId: assetId,
      payload: input as Record<string, unknown>
    });
  }
}
