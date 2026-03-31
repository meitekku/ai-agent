import { createClient } from "redis";
import { executeTask } from "./executor";
import { getStaleExecutions, updateExecution, getTaskById } from "./db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_KEY = "scheduler:task-queue";
const MAX_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "3", 10);

export async function startWorker(): Promise<void> {
  console.log(`[worker] Starting task worker (concurrency=${MAX_CONCURRENCY})...`);

  let isShuttingDown = false;
  let runningCount = 0;

  process.on("SIGTERM", () => {
    console.log("[worker] SIGTERM received, draining running tasks...");
    isShuttingDown = true;
  });
  process.on("SIGINT", () => {
    console.log("[worker] SIGINT received, draining running tasks...");
    isShuttingDown = true;
  });

  // Recover stale executions from previous crashes
  await recoverStaleExecutions();

  const redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => {
    console.error("[worker] Redis error:", err.message);
  });
  await redis.connect();
  console.log("[worker] Connected to Valkey, waiting for tasks...");

  // Main BRPOP loop — fires off tasks concurrently up to MAX_CONCURRENCY
  while (!isShuttingDown) {
    // Wait if at capacity
    if (runningCount >= MAX_CONCURRENCY) {
      await sleep(200);
      continue;
    }

    try {
      const result = await redis.brPop(QUEUE_KEY, 5);
      if (!result) continue;

      const payload = JSON.parse(result.element);
      console.log(
        `[worker] Received task ${payload.taskId} (execution ${payload.executionId}) [${runningCount + 1}/${MAX_CONCURRENCY} slots]`,
      );

      const task = await getTaskById(payload.taskId);
      if (task) {
        payload.taskName = task.name;
      }

      // Fire and forget — don't await
      runningCount++;
      processTask(payload, task, redis).finally(() => {
        runningCount--;
      });
    } catch (err) {
      if (isShuttingDown) break;
      console.error("[worker] Error processing task:", err);
    }
  }

  // Drain: wait for running tasks to finish
  if (runningCount > 0) {
    console.log(`[worker] Waiting for ${runningCount} running task(s) to finish...`);
    while (runningCount > 0) {
      await sleep(500);
    }
  }

  await redis.disconnect();
  console.log("[worker] Graceful shutdown complete.");
  process.exit(0);
}

async function processTask(
  payload: Record<string, unknown>,
  task: Awaited<ReturnType<typeof getTaskById>>,
  redis: { lPush: (key: string, value: string) => Promise<unknown> },
): Promise<void> {
  try {
    const execStatus = await executeTask(payload as any);

    // Retry on failure if retries remain
    if (execStatus === "failed") {
      const retryMax = (task?.retry_max ?? 0) as number;
      const retryCount = ((payload.retryCount as number) ?? 0);
      if (retryCount < retryMax) {
        const nextCount = retryCount + 1;
        console.log(
          `[worker] Task ${payload.taskId} failed, retry ${nextCount}/${retryMax}...`,
        );
        await updateExecution(payload.executionId as number, {
          status: "pending",
          retry_count: nextCount,
          error: null,
          result: null,
          started_at: null,
          completed_at: null,
        });
        await redis.lPush(
          QUEUE_KEY,
          JSON.stringify({ ...payload, retryCount: nextCount }),
        );
      }
    }
  } catch (err) {
    console.error(`[worker] Task ${payload.taskId} crashed:`, err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function recoverStaleExecutions(): Promise<void> {
  try {
    const stale = await getStaleExecutions();
    if (stale.length === 0) return;

    console.log(`[worker] Found ${stale.length} stale executions, recovering...`);

    const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);

    const toRequeue: { exec: typeof stale[0]; task: NonNullable<Awaited<ReturnType<typeof getTaskById>>> }[] = [];

    for (const exec of stale) {
      if (
        exec.status === "running" &&
        exec.started_at &&
        new Date(exec.started_at) < TEN_MINUTES_AGO
      ) {
        await updateExecution(exec.id, {
          status: "failed",
          completed_at: new Date(),
          error: "Worker crashed during execution (stale recovery)",
        });
        console.log(
          `[worker] Marked stale execution ${exec.id} as failed`,
        );
      } else if (exec.status === "pending" || exec.status === "queued") {
        const task = await getTaskById(exec.task_id);
        if (task) {
          toRequeue.push({ exec, task });
        } else {
          await updateExecution(exec.id, {
            status: "failed",
            completed_at: new Date(),
            error: "Task no longer exists (stale recovery)",
          });
        }
      }
    }

    if (toRequeue.length > 0) {
      const redis = createClient({ url: REDIS_URL });
      await redis.connect();
      try {
        for (const { exec, task } of toRequeue) {
          await redis.lPush(
            QUEUE_KEY,
            JSON.stringify({
              taskId: exec.task_id,
              executionId: exec.id,
              prompt: task.prompt,
              kbSlug: task.kb_slug,
              allowedTools: task.allowed_tools,
              maxToolCalls: task.max_tool_calls,
              timeoutSeconds: task.timeout_sec,
            }),
          );
          console.log(
            `[worker] Re-enqueued stale execution ${exec.id}`,
          );
        }
      } finally {
        await redis.disconnect();
      }
    }
  } catch (err) {
    console.error("[worker] Stale recovery failed:", err);
  }
}
