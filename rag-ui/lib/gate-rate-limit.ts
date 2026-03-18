import { createClient, type RedisClientType } from "redis";
import { REDIS_URL } from "./constants";

const LOCKOUT_SCHEDULE = [
  { attempts: 5, waitSeconds: 60 },
  { attempts: 6, waitSeconds: 300 },
  { attempts: 7, waitSeconds: 900 },
  { attempts: 8, waitSeconds: 3600 },
  { attempts: 9, waitSeconds: 10800 },
  { attempts: 10, waitSeconds: 86400 },
];

function getWaitSeconds(attempts: number): number {
  for (let i = LOCKOUT_SCHEDULE.length - 1; i >= 0; i--) {
    if (attempts >= LOCKOUT_SCHEDULE[i].attempts) {
      return LOCKOUT_SCHEDULE[i].waitSeconds;
    }
  }
  return 0;
}

let client: RedisClientType | null = null;
let connectionFailed = false;

async function getClient(): Promise<RedisClientType | null> {
  if (connectionFailed) return null;
  if (client?.isOpen) return client;

  try {
    client = createClient({ url: REDIS_URL });
    client.on("error", (err) => {
      console.error("[gate-rate-limit] Valkey error:", err.message);
    });
    await client.connect();
    return client;
  } catch {
    connectionFailed = true;
    client = null;
    return null;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remainingSeconds?: number;
}

export async function checkGateRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = await getClient();
  if (!redis) return { allowed: true };

  const key = `gate:pwd_attempt:${ip}`;
  const data = await redis.hGetAll(key);

  if (!data.attempts) return { allowed: true };

  const lockedUntil = parseInt(data.locked_until || "0");
  const now = Date.now();

  if (lockedUntil > now) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((lockedUntil - now) / 1000),
    };
  }

  return { allowed: true };
}

export async function recordGateFailure(ip: string): Promise<void> {
  const redis = await getClient();
  if (!redis) return;

  const key = `gate:pwd_attempt:${ip}`;
  const attempts = await redis.hIncrBy(key, "attempts", 1);
  const waitSeconds = getWaitSeconds(attempts);

  if (waitSeconds > 0) {
    await redis.hSet(key, "locked_until", Date.now() + waitSeconds * 1000);
  }

  await redis.expire(key, 86400);
}

export async function clearGateAttempts(ip: string): Promise<void> {
  const redis = await getClient();
  if (!redis) return;

  await redis.del(`gate:pwd_attempt:${ip}`);
}
