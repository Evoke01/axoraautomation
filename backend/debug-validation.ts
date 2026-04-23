import { buildApp } from "./src/app.js";
import { JobName } from "./src/queues/names.js";
import { buildJobId, getJobPolicy } from "./src/queues/job-policy.js";

async function main() {
  console.log("Building app...");
  const app = await buildApp();
  await app.ready();
  console.log("App ready! Worker is running.\n");

  // Find all READY assets that need to continue through the pipeline
  const readyAssets = await app.services.prisma.asset.findMany({
    where: { status: "READY" },
    select: { id: true, title: true, status: true }
  });

  console.log(`Found ${readyAssets.length} READY assets to push through pipeline:\n`);

  for (const asset of readyAssets) {
    // Check if this asset already has campaigns/metadata (already processed)
    const campaigns = await app.services.prisma.campaign.findMany({
      where: { assetId: asset.id }
    });
    
    if (campaigns.length > 0) {
      console.log(`  ⏭ SKIP: "${asset.title}" - already has ${campaigns.length} campaign(s)`);
      continue;
    }

    // Check if it has metadata variants
    const variants = await app.services.prisma.metadataVariant.findMany({
      where: { assetId: asset.id }
    });

    if (variants.length > 0) {
      console.log(`  ⏭ SKIP: "${asset.title}" - already has metadata, queuing CampaignPlan`);
      await app.services.queue.add(JobName.CampaignPlan, { assetId: asset.id }, {
        ...getJobPolicy(JobName.CampaignPlan),
        jobId: buildJobId(JobName.CampaignPlan, asset.id)
      });
      continue;
    }

    // Queue AssetAnalyze (the step right after READY)
    console.log(`  ▶ Queuing AssetAnalyze for: "${asset.title}"`);
    await app.services.queue.add(JobName.AssetAnalyze, { assetId: asset.id }, {
      ...getJobPolicy(JobName.AssetAnalyze),
      jobId: buildJobId(JobName.AssetAnalyze, asset.id)
    });
  }

  console.log("\nAll jobs queued. Worker is processing...");
  console.log("(Keeping alive for 5 minutes to let the pipeline complete)\n");

  // Monitor progress every 30 seconds
  const startTime = Date.now();
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes

  const interval = setInterval(async () => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const counts = await app.services.queue.getJobCounts();
    
    // Check asset statuses
    const statuses = await app.services.prisma.asset.groupBy({ by: ["status"], _count: true });
    const statusStr = statuses.map(s => `${s.status}:${s._count}`).join(", ");
    
    console.log(`[${elapsed}s] Queue: active=${counts.active}, waiting=${counts.waiting}, failed=${counts.failed} | Assets: ${statusStr}`);

    if (counts.active === 0 && counts.waiting === 0 && Date.now() - startTime > 30_000) {
      console.log("\n✓ All jobs completed! Final asset statuses:");
      for (const s of statuses) {
        console.log(`  ${s.status}: ${s._count}`);
      }
      clearInterval(interval);
      process.exit(0);
    }

    if (Date.now() - startTime > maxWaitMs) {
      console.log("\n⏱ Timeout reached. Some jobs may still be processing on the deployed worker.");
      clearInterval(interval);
      process.exit(0);
    }
  }, 15_000);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
