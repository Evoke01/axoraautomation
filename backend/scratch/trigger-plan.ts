import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import "dotenv/config";

const prisma = new PrismaClient();
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const queue = new Queue("axora", {
    connection: {
      url: REDIS_URL
    }
  });

  const waitingAssets = await prisma.asset.findMany({
    where: {
      status: "READY",
      campaigns: { none: {} }
    },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Found ${waitingAssets.length} waiting assets. Triggering planning now...`);

  for (const asset of waitingAssets) {
    console.log(`-> Triggering CampaignPlan for: ${asset.title}`);
    await queue.add("CampaignPlan", { assetId: asset.id }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      jobId: `plan:${asset.id}:${Date.now()}`
    });
  }

  await queue.close();
}

main().catch(console.error).finally(() => prisma.$disconnect());
