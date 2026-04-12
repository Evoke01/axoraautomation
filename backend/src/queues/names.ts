export const QUEUE_NAME = "axora";

export const JobName = {
  AssetIngest: "asset.ingest",
  AssetAnalyze: "asset.analyze",
  MetadataGenerate: "metadata.generate",
  CampaignPlan: "campaign.plan",
  ReviewEvaluate: "review.evaluate",
  PublishExecute: "publish.execute",
  MetricsRefresh: "metrics.refresh",
  OptimizationRecompute: "optimization.recompute",
  OpportunityReport: "opportunity.report",
  AuditRetention: "audit.retention"
} as const;

export type JobName = (typeof JobName)[keyof typeof JobName];
