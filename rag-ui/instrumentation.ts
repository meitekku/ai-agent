import { createClient } from "redis";

export async function onRequestInit() {
  // no-op: only need register hook
}

export async function register() {
  // Flush semantic cache on startup (runs once per deploy/rebuild)
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  try {
    const client = createClient({ url: redisUrl });
    await client.connect();
    const keys = await client.keys("rag:cache:*");
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`[startup] Flushed ${keys.length} cache keys`);
    } else {
      console.log("[startup] No cache keys to flush");
    }
    await client.quit();
  } catch (err) {
    console.error("[startup] Cache flush failed:", (err as Error).message);
  }
}
