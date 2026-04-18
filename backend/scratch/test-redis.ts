import { Redis } from "ioredis";
import { Queue } from "bullmq";
import "dotenv/config";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function testRedis() {
  console.log(`Connecting to Redis at ${REDIS_URL}...`);
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  
  try {
    const ping = await redis.ping();
    console.log(`Redis PING: ${ping}`);
    
    const queue = new Queue("axora", { connection: redis });
    console.log("Adding test job...");
    const job = await queue.add("test", { hello: "world" }, { removeOnComplete: true });
    console.log(`Job added with ID: ${job.id}`);
    
    await queue.close();
  } catch (err) {
    console.error("Redis/BullMQ Error:", err);
  } finally {
    await redis.quit();
  }
}

testRedis().catch(console.error);
