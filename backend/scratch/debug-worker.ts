import { Worker } from "bullmq";
import "dotenv/config";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  console.log("Starting debug worker...");
  const worker = new Worker("axora", async (job) => {
    console.log(`Processing job ${job.id} (${job.name})...`);
    // Just fake success for now to see if it works
    return { success: true };
  }, {
    connection: { url: REDIS_URL }
  });

  worker.on("completed", (job) => console.log(`Job ${job.id} completed!`));
  worker.on("failed", (job, err) => console.log(`Job ${job?.id} failed: ${err.message}`));
  
  console.log("Worker is listening...");
}

main().catch(console.error);
