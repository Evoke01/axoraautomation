import type { JobsOptions } from "bullmq";

import { JobName } from "./names.js";

const DEFAULT_REMOVE_ON_COMPLETE = 200;
const DEFAULT_REMOVE_ON_FAIL = 500;

const policyByJobName: Record<JobName, JobsOptions> = {
  [JobName.AssetIngest]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.AssetAnalyze]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.MetadataGenerate]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.CampaignPlan]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 8_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.ReviewEvaluate]: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.PublishExecute]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.MetricsRefresh]: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.MetricsCheckpointCapture]: {
    attempts: 8,
    backoff: { type: "exponential", delay: 15 * 60 * 1000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.LearningRun]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubeAnalyticsRefresh]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubePostMetricsRefresh]: {
    attempts: 4,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubeCompetitorRefresh]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubeChannelSync]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubeVideoBackfill]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.YouTubeMetricsSnapshot]: {
    attempts: 4,
    backoff: { type: "exponential", delay: 20_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.IntelligenceOverviewRefresh]: {
    attempts: 4,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.OptimizationRecompute]: {
    attempts: 3,
    backoff: { type: "fixed", delay: 10_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.OpportunityReport]: {
    attempts: 3,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.AuditRetention]: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  },
  [JobName.DripFeedCheck]: {
    attempts: 2,
    backoff: { type: "fixed", delay: 10_000 },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL
  }
};

export function getJobPolicy(jobName: JobName): JobsOptions {
  return policyByJobName[jobName];
}

export function buildJobId(jobName: JobName, key: string) {
  return `${jobName}--${key}`;
}
