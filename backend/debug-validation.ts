import { buildApp } from "./src/app.js";

async function main() {
  console.log("Building app...");
  const app = await buildApp();
  console.log("App built. Calling ready()...");
  await app.ready();
  console.log("App ready!");

  // Check queue health
  const counts = await app.services.queue.getJobCounts();
  console.log("Queue job counts:", counts);

  // Check stuck assets
  const stuck = await app.services.prisma.asset.findMany({
    where: { status: { in: ["VALIDATING", "REJECTED"] } },
    select: { id: true, title: true, status: true, createdAt: true }
  });
  console.log(`\nStuck assets (${stuck.length}):`);
  for (const a of stuck) {
    console.log(`  - [${a.status}] ${a.title} (${a.id})`);
  }

  // Try retrying all stuck assets
  if (stuck.length > 0) {
    console.log("\nRetrying all stuck assets...");
    for (const a of stuck) {
      try {
        await app.services.assets.retryAssetIngest(a.id);
        console.log(`  ✓ Retried: ${a.title}`);
      } catch (err: any) {
        console.error(`  ✗ Failed: ${a.title} - ${err.message}`);
      }
    }

    // Check queue again
    const newCounts = await app.services.queue.getJobCounts();
    console.log("\nQueue job counts after retry:", newCounts);
  }

  process.exit(0);
}

main().catch(console.error);
