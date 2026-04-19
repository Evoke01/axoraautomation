import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  AssetStatus,
  AuditTargetType,
  ContentFormat,
  DecisionStatus,
  Platform,
  PostStatus,
  type PrismaClient
} from "@prisma/client";
import type { Queue } from "bullmq";

import { NotFoundError, ValidationError } from "../lib/errors.js";
import { buildJobId, getJobPolicy } from "../queues/job-policy.js";
import { JobName } from "../queues/names.js";
import { AuditService } from "./audit-service.js";
import { MultiAgentService } from "./multi-agent-service.js";

function pickPublishTime(timezone: string) {
  const zonedNow = toZonedTime(new Date(), timezone);
  const scheduled = new Date(zonedNow);
  scheduled.setHours(18, 0, 0, 0);

  if (scheduled <= zonedNow) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  return fromZonedTime(scheduled, timezone);
}

export class CampaignService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Queue,
    private readonly audit: AuditService,
    private readonly agents: MultiAgentService
  ) {}

  async planAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        workspace: {
          include: {
            entitlements: true
          }
        },
        files: true,
        metadataVariants: true,
        creator: true
      }
    });

    if (!asset) {
      throw new NotFoundError("Asset was not found.");
    }

    if (asset.status !== AssetStatus.READY && asset.status !== AssetStatus.PLANNED) {
      throw new ValidationError("Asset is not ready for campaign planning.");
    }

    const metadataVariant = asset.metadataVariants.find((variant) => variant.platform === Platform.YOUTUBE);
    if (!metadataVariant) {
      throw new ValidationError("Metadata variants are missing for campaign planning.");
    }

    const account = await this.prisma.connectedAccount.findFirst({
      where: {
        workspaceId: asset.workspaceId,
        platform: Platform.YOUTUBE,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "asc" }
    });

    const format =
      (asset.files[0]?.durationSeconds ?? 0) <= 60 ? ContentFormat.YOUTUBE_SHORT : ContentFormat.YOUTUBE_VIDEO;
    const scheduleRecommendation = await this.agents
      .recommendSchedule({
        workspaceId: asset.workspaceId,
        timezone: asset.workspace.timezone,
        creatorName: asset.creator.name,
        creatorNiche: asset.creator.niche,
        assetTitle: asset.title,
        assetIntelligence:
          asset.intelligence && typeof asset.intelligence === "object"
            ? (asset.intelligence as Record<string, unknown>)
            : null
      })
      .catch(() => null);
    const scheduledFor = scheduleRecommendation?.scheduledFor ?? pickPublishTime(asset.workspace.timezone);
    const scheduleRationale =
      scheduleRecommendation?.rationale ?? "Initial distribution run based on default creator timing.";
    const schedulingProvider = scheduleRecommendation?.provider ?? "heuristic";
    const schedulingConfidence = scheduleRecommendation?.confidence ?? 0.75;

    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        status: "ACTIVE",
        summary: {
          platform: Platform.YOUTUBE,
          format,
          schedulingProvider,
          schedulingConfidence
        },
        waves: {
          create: {
            waveNumber: 1,
            status: "PENDING",
            scheduledFor,
            rationale: scheduleRationale,
            decisions: {
              create: {
                connectedAccountId: account?.id,
                metadataVariantId: metadataVariant.id,
                platform: Platform.YOUTUBE,
                format,
                status: DecisionStatus.SCHEDULED,
                scheduledFor,
                publishAt: scheduledFor,
                score: schedulingConfidence,
                predictedViews: 500,
                predictedEngagement: 0.06,
                rationale: {
                  scheduleRationale,
                  schedulingConfidence,
                  schedulingProvider,
                  baselineWindow: schedulingProvider === "heuristic" ? "evening" : null,
                  platform: Platform.YOUTUBE,
                  category: asset.creator.niche ?? "general"
                },
                post: {
                  create: {
                    workspaceId: asset.workspaceId,
                    assetId: asset.id,
                    connectedAccountId: account?.id,
                    platform: Platform.YOUTUBE,
                    status: PostStatus.SCHEDULED,
                    nextPollAt: new Date(scheduledFor.getTime() + 30 * 60 * 1000)
                  }
                }
              }
            }
          }
        }
      },
      include: {
        waves: {
          include: {
            decisions: true
          }
        }
      }
    });

    await this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: AssetStatus.PLANNED
      }
    });

    await this.audit.log({
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      eventType: "campaign.planned",
      targetType: AuditTargetType.CAMPAIGN,
      targetId: campaign.id,
      payload: {
        scheduledFor: scheduledFor.toISOString(),
        accountId: account?.id ?? null,
        schedulingProvider,
        schedulingConfidence
      }
    });

    return campaign;
  }

  async evaluateReviewGate(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        workspace: {
          include: {
            entitlements: true
          }
        },
        campaigns: {
          include: {
            waves: {
              include: {
                decisions: true
              }
            }
          }
        }
      }
    });

    if (!asset) {
      throw new NotFoundError("Asset was not found.");
    }

    const decision = asset.campaigns
      .flatMap((campaign) => campaign.waves)
      .flatMap((wave) => wave.decisions)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    if (!decision) {
      throw new ValidationError("Asset does not have a distribution decision yet.");
    }

    if ((asset.workspace.entitlements?.manualReviewRequired ?? true) || !decision.connectedAccountId) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          status: AssetStatus.PENDING_REVIEW
        }
      });

      return { status: "pending_review" as const };
    }

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.APPROVED
      }
    });

    await this.schedulePublish(decision.id, decision.scheduledFor);

    return { status: "scheduled" as const, decisionId: decision.id };
  }

  async approveAsset(assetId: string, actorId?: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        campaigns: {
          include: {
            waves: {
              include: {
                decisions: true
              }
            }
          }
        }
      }
    });

    if (!asset) {
      throw new NotFoundError("Asset was not found.");
    }

    const decision = asset.campaigns
      .flatMap((campaign) => campaign.waves)
      .flatMap((wave) => wave.decisions)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    if (!decision) {
      throw new ValidationError("Asset does not have a distribution decision yet.");
    }

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.APPROVED
      }
    });

    await this.audit.log({
      workspaceId: asset.workspaceId,
      assetId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      eventType: "asset.approved",
      targetType: AuditTargetType.ASSET,
      targetId: assetId
    });

    await this.schedulePublish(decision.id, decision.scheduledFor);
  }

  async schedulePublish(decisionId: string, scheduledFor: Date) {
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    await this.queue.add(
      JobName.PublishExecute,
      { decisionId },
      {
        ...getJobPolicy(JobName.PublishExecute),
        delay,
        jobId: buildJobId(JobName.PublishExecute, decisionId)
      }
    );
  }
}
