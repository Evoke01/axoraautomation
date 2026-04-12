import type { Redis } from "ioredis";

export async function withLeaderLock<T>(
  redis: Redis,
  key: string,
  ttlMs: number,
  task: () => Promise<T>
): Promise<T | null> {
  const lockValue = `${process.pid}:${Date.now()}`;
  const acquired = await redis.set(key, lockValue, "PX", ttlMs, "NX");

  if (acquired !== "OK") {
    return null;
  }

  try {
    return await task();
  } finally {
    const currentValue = await redis.get(key);
    if (currentValue === lockValue) {
      await redis.del(key);
    }
  }
}
