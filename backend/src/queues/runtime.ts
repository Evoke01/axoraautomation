import { Worker } from "bullmq";
import { addHours } from "date-fns";
import { Platform, PostStatus } from "@prisma/client";

import type { AppServices } from "../app.js";
import { ValidationError } from "../lib/errors.js";
import { withLeaderLock } from "../lib/leader-lock.js";
import { isWeeklyReportWindow } from "../lib/time.js";
import { buildJobId, getJobPolicy } from "./job-policy.js";
import { JobName, QUEUE_NAME } from "./names.js";

async function scheduleMetricRefresh(services: AppServices, postId: string, pollCount: number) {
  const delays = [30, 6 * 60, 24 * 60, 48 * 60, 72 * 60, 96 * 60, 120 * 60, 144 * 60];
  const nextDelayMinutes = delays[pollCount];

  if (!nextDelayMinutes) {
    return;
  }

  await services.queue.add(
    JobName.MetricsRefresh,
    { postId },
    {
      ...getJobPolicy(JobName.MetricsRefresh),
      delay: nextDelayMinutes * 60 * 1000,
      jobId: buildJobId(JobName.MetricsRefresh, `${postId}:${pollCount + 1}`)
    }
  );
}

export async function registerRecurringJobs(services: AppServices) {
  await services.queue.add(
    JobName.OpportunityReport,
    {},
    {
      ...getJobPolicy(JobName.OpportunityReport),
      repeat: {
        every: 60 * 60 * 1000
      },
      jobId: "opportunity-report-hourly"
    }
  );

  await services.queue.add(
    JobName.AuditRetention,
    {},
    {
      ...getJobPolicy(JobName.AuditRetention),
      repeat: {
        every: 24 * 60 * 60 * 1000
      },
      jobId: "audit-retention-daily"
    }
  );

  await services.queue.add(
    JobName.YouTubeChannelSync,
    {},
    {
      ...getJobPolicy(JobName.YouTubeChannelSync),
      repeat: {
        every: 6 * 60 * 60 * 1000
      },
      jobId: "youtube-channel-sync-6h"
    }
  );
}

export function createWorker(services: AppServices) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case JobName.AssetIngest: {
          const assetId = asString(job.data.assetId);
          await services.validation.inspect(assetId);
          await services.queue.add(JobName.AssetAnalyze, { assetId }, {
            ...getJobPolicy(JobName.AssetAnalyze),
            jobId: buildJobId(JobName.AssetAnalyze, assetId)
          });
          break;
        }
        case JobName.AssetAnalyze: {
          const assetId = asString(job.data.assetId);
          await services.intelligence.analyzeVideo(assetId);
          await services.queue.add(JobName.MetadataGenerate, { assetId }, {
            ...getJobPolicy(JobName.MetadataGenerate),
            jobId: buildJobId(JobName.MetadataGenerate, assetId)
          });
          break;
        }
        case JobName.MetadataGenerate: {
          const assetId = asString(job.data.assetId);
          await services.metadata.generate(assetId);
          await services.queue.add(JobName.CampaignPlan, { assetId }, {
            ...getJobPolicy(JobName.CampaignPlan),
            jobId: buildJobId(JobName.CampaignPlan, assetId)
          });
          break;
        }
        case JobName.CampaignPlan: {
          const assetId = asString(job.data.assetId);
          await services.campaigns.planAsset(assetId);
          await services.queue.add(JobName.ReviewEvaluate, { assetId }, {
            ...getJobPolicy(JobName.ReviewEvaluate),
            jobId: buildJobId(JobName.ReviewEvaluate, assetId)
          });
          break;
        }
        case JobName.ReviewEvaluate: {
          const assetId = asString(job.data.assetId);
          await services.campaigns.evaluateReviewGate(assetId);
          break;
        }
        case JobName.PublishExecute: {
          const decisionId = asString(job.data.decisionId);
          const decision = await services.prisma.distributionDecision.findUnique({
            where: { id: decisionId },
            include: {
              campaignWave: {
                include: {
                  campaign: {
                    include: {
                      asset: true
                    }
                  }
                }
              }
            }
          });

          if (!decision) {
            throw new ValidationError("Decision was not found.");
          }

          if (decision.scheduledFor > new Date()) {
            await services.campaigns.schedulePublish(decisionId, decision.scheduledFor);
            return;
          }

          if (!decision.connectedAccountId) {
            await services.prisma.asset.update({
              where: { id: decision.campaignWave.campaign.asset.id },
              data: { status: "PENDING_REVIEW" }
            });
            return;
          }

          await services.quota.reserve(
            Platform.YOUTUBE,
            decision.connectedAccountId,
            services.env.YOUTUBE_UPLOAD_RESERVATION_UNITS
          );

          try {
            await services.youtube.publish(decisionId);
            await services.quota.markUsed(
              Platform.YOUTUBE,
              decision.connectedAccountId,
              services.env.YOUTUBE_UPLOAD_RESERVATION_UNITS
            );

            await services.prisma.asset.update({
              where: { id: decision.campaignWave.campaign.asset.id },
              data: { status: "PUBLISHED" }
            });

            const post = await services.prisma.platformPost.findUnique({
              where: { decisionId }
            });

            if (post) {
              await scheduleMetricRefresh(services, post.id, 0);
            }
          } catch (error) {
            await services.quota.releaseReservation(
              Platform.YOUTUBE,
              decision.connectedAccountId,
              services.env.YOUTUBE_UPLOAD_RESERVATION_UNITS
            );
            throw error;
          }
          break;
        }
        case JobName.MetricsRefresh: {
          const postId = asString(job.data.postId);
          const post = await services.prisma.platformPost.findUnique({
            where: { id: postId }
          });

          if (!post || post.status !== PostStatus.PUBLISHED) {
            return;
          }

          const [result] = await services.youtube.refreshMetrics([postId]);
          if (!result) {
            return;
          }

          await services.prisma.postMetricsSnapshot.create({
            data: {
              platformPostId: postId,
              views: result.metrics.views,
              likes: result.metrics.likes,
              comments: result.metrics.comments,
              rawMetrics: result.metrics
            }
          });

          const pollCount = post.pollCount + 1;
          await services.prisma.platformPost.update({
            where: { id: postId },
            data: {
              pollCount,
              lastPolledAt: new Date(),
              metrics: result.metrics,
              nextPollAt: addHours(new Date(), 24)
            }
          });

          await services.optimization.recompute(post.workspaceId);
          await scheduleMetricRefresh(services, postId, pollCount);
          break;
        }
        case JobName.YouTubeChannelSync: {
          const workspaceId = typeof job.data.workspaceId === "string" ? job.data.workspaceId : undefined;
          await services.youtubeHistory.syncWorkspaceChannels(workspaceId);
          break;
        }
        case JobName.YouTubeVideoBackfill: {
          const channelId = asString(job.data.channelId);
          await services.youtubeHistory.backfillChannelVideos(channelId);
          break;
        }
        case JobName.YouTubeMetricsSnapshot: {
          const videoId = asString(job.data.videoId);
          await services.youtubeHistory.captureVideoSnapshot(videoId);
          break;
        }
        case JobName.OptimizationRecompute: {
          const workspaceId = asString(job.data.workspaceId);
          await services.optimization.recompute(workspaceId);
          break;
        }
        case JobName.OpportunityReport: {
          await withLeaderLock(services.redis, "leader:opportunity-report", 55 * 60 * 1000, async () => {
            const workspaces = await services.prisma.workspace.findMany();
            for (const workspace of workspaces) {
              if (isWeeklyReportWindow(new Date(), workspace.timezone, services.env.DEFAULT_WEEKLY_REPORT_HOUR)) {
                const recentReport = await services.prisma.opportunityReport.findFirst({
                  where: {
                    workspaceId: workspace.id,
                    generatedAt: {
                      gte: addHours(new Date(), -12)
                    }
                  }
                });

                if (!recentReport) {
                  await services.optimization.generateOpportunityReport(workspace.id, workspace.timezone);
                }
              }
            }
          });
          break;
        }
        case JobName.AuditRetention: {
          await withLeaderLock(services.redis, "leader:audit-retention", 10 * 60 * 1000, async () => {
            await services.audit.purgeExpired(30);
          });
          break;
        }
        default:
          throw new ValidationError(`Unsupported job name: ${job.name}`);
      }
    },
    {
      connection: services.redis,
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("[queue] job_failed", {
      id: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  worker.on("completed", (job) => {
    console.info("[queue] job_completed", { id: job.id, name: job.name });
  });

  worker.on("stalled", (jobId) => {
    console.warn("[queue] job_stalled", { id: jobId });
  });

  return worker;
}

function asString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError("Job payload is missing a string value.");
  }

  return value;
}
