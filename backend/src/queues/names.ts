export const QUEUE_NAME = "axora";

export const JobName = {
  AssetIngest: "asset.ingest",
  AssetAnalyze: "asset.analyze",
  MetadataGenerate: "metadata.generate",
  CampaignPlan: "campaign.plan",
  ReviewEvaluate: "review.evaluate",
  PublishExecute: "publish.execute",
  MetricsRefresh: "metrics.refresh",
  MetricsCheckpointCapture: "metrics.checkpoint.capture",
  LearningRun: "learning.run",
  YouTubeAnalyticsRefresh: "youtube.analytics.refresh",
  YouTubePostMetricsRefresh: "youtube.post-metrics.refresh",
  YouTubeCompetitorRefresh: "youtube.competitor.refresh",
  YouTubeChannelSync: "youtube.channel.sync",
  YouTubeVideoBackfill: "youtube.video.backfill",
  YouTubeMetricsSnapshot: "youtube.metrics.snapshot",
  IntelligenceOverviewRefresh: "intelligence.overview.refresh",
  OptimizationRecompute: "optimization.recompute",
  OpportunityReport: "opportunity.report",
  AuditRetention: "audit.retention"
} as const;

export type JobName = (typeof JobName)[keyof typeof JobName];
