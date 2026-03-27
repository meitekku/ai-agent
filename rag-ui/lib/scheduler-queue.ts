import { createClient, type RedisClientType } from "redis";
import { REDIS_URL } from "./constants";

const QUEUE_KEY = "scheduler:task-queue";

let client: RedisClientType | null = null;

async function getClient(): Promise<RedisClientType> {
  if (client?.isOpen) return client;
  client = createClient({ url: REDIS_URL });
  client.on("error", (err) => {
    console.error("[scheduler-queue] Redis error:", err.message);
  });
  await client.connect();
  return client;
}

export interface TaskQueuePayload {
  taskId: number;
  executionId: number;
  prompt: string;
  kbSlug: string | null;
  allowedTools: string[];
  maxToolCalls: number;
  timeoutSeconds: number;
  model: string | null;
  notifyTo: string | null;
  notifyFrom: string | null;
}

export async function enqueueTask(payload: TaskQueuePayload): Promise<void> {
  const redis = await getClient();
  await redis.lPush(QUEUE_KEY, JSON.stringify(payload));
  console.log(
    `[scheduler-queue] Enqueued task ${payload.taskId} (execution ${payload.executionId})`,
  );
}

export async function getQueueLength(): Promise<number> {
  const redis = await getClient();
  return redis.lLen(QUEUE_KEY);
}
