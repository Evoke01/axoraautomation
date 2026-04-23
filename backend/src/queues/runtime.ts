import { Worker } from "bullmq";
import { Platform, PostStatus, type PerformanceCheckpointKey } from "@prisma/client";

import type { AppServices } from "../app.js";
import { ValidationError } from "../lib/errors.js";
import { withLeaderLock } from "../lib/leader-lock.js";
import { isWeeklyReportWindow } from "../lib/time.js";
import { PERFORMANCE_CHECKPOINT_KEYS, getCheckpointOffsetMs } from "../lib/youtube-learning.js";
import { getNextYouTubePostMetricDelayMinutes } from "../lib/youtube-freshness.js";
import { buildJobId, getJobPolicy } from "./job-policy.js";
import { JobName, QUEUE_NAME } from "./names.js";

export async function registerRecurringJobs(services: AppServices) {
  await services.queue.add(
    JobName.YouTubePostMetricsRefresh,
    {},
    {
      ...getJobPolicy(JobName.YouTubePostMetricsRefresh),
      repeat: {
        every: 5 * 60 * 1000
      },
      jobId: "youtube-post-metrics-refresh-5m"
    }
  );

  await services.queue.add(
    JobName.YouTubeAnalyticsRefresh,
    {},
    {
      ...getJobPolicy(JobName.YouTubeAnalyticsRefresh),
      repeat: {
        every: 15 * 60 * 1000
      },
      jobId: "youtube-analytics-refresh-15m"
    }
  );

  await services.queue.add(
    JobName.YouTubeCompetitorRefresh,
    {},
    {
      ...getJobPolicy(JobName.YouTubeCompetitorRefresh),
      repeat: {
        every: 30 * 60 * 1000
      },
      jobId: "youtube-competitor-refresh-30m"
    }
  );

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

  await services.queue.add(
    JobName.DripFeedCheck,
    {},
    {
      ...getJobPolicy(JobName.DripFeedCheck),
      repeat: {
        every: 10 * 60 * 1000 // Every 10 minutes
      },
      jobId: "drip-feed-check-10m"
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
          // Wait for DripFeedCheck to push to CampaignPlan instead of doing it immediately
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
            const post = await services.youtube.publish(decisionId);
            await services.quota.markUsed(
              Platform.YOUTUBE,
              decision.connectedAccountId,
              services.env.YOUTUBE_UPLOAD_RESERVATION_UNITS
            );

            await services.prisma.asset.update({
              where: { id: decision.campaignWave.campaign.asset.id },
              data: { status: "PUBLISHED" }
            });
            await scheduleLearningCheckpointJobs(services, post.id, post.publishedAt ?? new Date());
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

          const nextDelayMinutes = getNextYouTubePostMetricDelayMinutes(post.publishedAt);
          await services.prisma.platformPost.update({
            where: { id: postId },
            data: {
              pollCount: post.pollCount + 1,
              lastPolledAt: new Date(),
              metrics: result.metrics,
              nextPollAt:
                nextDelayMinutes === null
                  ? null
                  : new Date(Date.now() + nextDelayMinutes * 60 * 1000)
            }
          });

          await services.optimization.recompute(post.workspaceId);
          break;
        }
        case JobName.MetricsCheckpointCapture: {
          const postId = asString(job.data.postId);
          const checkpointKey = asCheckpointKey(job.data.checkpointKey);
          const result = await services.learning.captureCheckpoint(postId, checkpointKey);

          if (result.status === "retry") {
            await services.queue.add(
              JobName.MetricsCheckpointCapture,
              { postId, checkpointKey },
              {
                ...getJobPolicy(JobName.MetricsCheckpointCapture),
                delay: result.delayMs,
                jobId: buildJobId(
                  JobName.MetricsCheckpointCapture,
                  `${postId}:${checkpointKey}:retry:${Date.now()}`
                )
              }
            );
          }

          if (result.status === "captured") {
            await services.queue.add(
              JobName.LearningRun,
              { creatorId: result.creatorId, checkpointKey },
              {
                ...getJobPolicy(JobName.LearningRun),
                jobId: buildJobId(JobName.LearningRun, `${result.creatorId}:${Date.now()}`)
              }
            );
          }
          break;
        }
        case JobName.LearningRun: {
          const creatorId = asString(job.data.creatorId);
          const checkpointKey =
            typeof job.data.checkpointKey === "string"
              ? asCheckpointKey(job.data.checkpointKey)
              : null;
          await services.learning.recomputeCreatorProfile(creatorId, { triggerCheckpointKey: checkpointKey });
          break;
        }
        case JobName.YouTubePostMetricsRefresh: {
          const workspaceId = typeof job.data.workspaceId === "string" ? job.data.workspaceId : undefined;
          const touchedWorkspaces = await services.youtubeHistory.refreshDuePostMetrics(workspaceId);
          for (const touchedWorkspaceId of touchedWorkspaces) {
            await services.queue.add(
              JobName.OptimizationRecompute,
              { workspaceId: touchedWorkspaceId },
              {
                ...getJobPolicy(JobName.OptimizationRecompute),
                jobId: buildJobId(JobName.OptimizationRecompute, touchedWorkspaceId)
              }
            );
          }
          break;
        }
        case JobName.YouTubeAnalyticsRefresh: {
          const workspaceId = typeof job.data.workspaceId === "string" ? job.data.workspaceId : undefined;
          await services.youtubeHistory.refreshWorkspaceChannelAnalytics(workspaceId);
          break;
        }
        case JobName.YouTubeCompetitorRefresh: {
          const workspaceId = typeof job.data.workspaceId === "string" ? job.data.workspaceId : undefined;
          await services.youtubeHistory.refreshWorkspaceCompetitors(workspaceId);
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
        case JobName.IntelligenceOverviewRefresh: {
          const workspaceId = asString(job.data.workspaceId);
          await services.youtubeHistory.refreshWorkspaceChannelAnalytics(workspaceId);
          await services.youtubeHistory.refreshDuePostMetrics(workspaceId);
          await services.youtubeHistory.refreshWorkspaceCompetitors(workspaceId);
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
                      gte: new Date(Date.now() - 12 * 60 * 60 * 1000)
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
        case JobName.DripFeedCheck: {
          await withLeaderLock(services.redis, "leader:drip-feed-check", 2 * 60 * 1000, async () => {
            const creators = await services.prisma.creator.findMany({ select: { id: true } });
            
            for (const creator of creators) {
              const activeCampaignsCount = await services.prisma.campaign.count({
                where: {
                  asset: { 
                    creatorId: creator.id,
                    status: { not: "ARCHIVED" }
                  },
                  status: { in: ["ACTIVE", "DRAFT"] }
                }
              });

              if (activeCampaignsCount < 2) {
                const availableSlots = 2 - activeCampaignsCount;
                
                const waitingAssets = await services.prisma.asset.findMany({
                  where: {
                    creatorId: creator.id,
                    status: "READY",
                    campaigns: { none: {} }
                  },
                  orderBy: { createdAt: "asc" },
                  take: availableSlots
                });

                for (const asset of waitingAssets) {
                  await services.queue.add(JobName.CampaignPlan, { assetId: asset.id }, {
                    ...getJobPolicy(JobName.CampaignPlan),
                    jobId: buildJobId(JobName.CampaignPlan, asset.id)
                  });
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

function asCheckpointKey(value: unknown): PerformanceCheckpointKey {
  if (
    value === "H24" ||
    value === "H72" ||
    value === "D7" ||
    value === "D30"
  ) {
    return value;
  }

  throw new ValidationError("Job payload is missing a valid checkpoint key.");
}

export async function scheduleLearningCheckpointJobs(
  services: AppServices,
  postId: string,
  publishedAt: Date
) {
  await Promise.all(
    PERFORMANCE_CHECKPOINT_KEYS.map((checkpointKey) =>
      services.queue.add(
        JobName.MetricsCheckpointCapture,
        { postId, checkpointKey },
        {
          ...getJobPolicy(JobName.MetricsCheckpointCapture),
          delay: Math.max(0, publishedAt.getTime() + getCheckpointOffsetMs(checkpointKey) - Date.now()),
          jobId: buildJobId(JobName.MetricsCheckpointCapture, `${postId}:${checkpointKey}`)
        }
      )
    )
  );
}
