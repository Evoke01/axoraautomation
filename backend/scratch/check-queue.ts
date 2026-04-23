import { Queue } from "bullmq";
import "dotenv/config";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const queue = new Queue("axora", {
    connection: {
      url: REDIS_URL
    }
  });

  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  console.log("Queue Job Counts:", JSON.stringify(counts, null, 2));

  const waiting = await queue.getWaiting();
  console.log(`First 5 waiting jobs:`);
  waiting.slice(0, 5).forEach(job => {
    console.log(`- [${job.id}] ${job.name}`);
  });

  await queue.close();
}

main().catch(console.error);
