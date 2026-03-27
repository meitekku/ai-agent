import { createClient, type RedisClientType } from "redis";
import { executeTask } from "./executor";
import { getStaleExecutions, updateExecution, getTaskById } from "./db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_KEY = "scheduler:task-queue";

export async function startWorker(): Promise<void> {
  console.log("[worker] Starting task worker...");

  // Recover stale executions from previous crashes
  await recoverStaleExecutions();

  const redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => {
    console.error("[worker] Redis error:", err.message);
  });
  await redis.connect();
  console.log("[worker] Connected to Valkey, waiting for tasks...");

  // Main BRPOP loop
  while (true) {
    try {
      // BRPOP blocks for 5 seconds, then loops (allows graceful shutdown checks)
      const result = await redis.brPop(QUEUE_KEY, 5);
      if (!result) continue;

      const payload = JSON.parse(result.element);
      console.log(
        `[worker] Received task ${payload.taskId} (execution ${payload.executionId})`,
      );

      // Fetch task name for notifications
      const task = await getTaskById(payload.taskId);
      if (task) {
        payload.taskName = payload.taskName || `Task #${payload.taskId}`;
      }

      await executeTask(payload);
    } catch (err) {
      console.error("[worker] Error processing task:", err);
      // Continue loop — don't crash the worker
    }
  }
}

async function recoverStaleExecutions(): Promise<void> {
  try {
    const stale = await getStaleExecutions();
    if (stale.length === 0) return;

    console.log(`[worker] Found ${stale.length} stale executions, recovering...`);

    const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);

    for (const exec of stale) {
      if (
        exec.status === "running" &&
        exec.started_at &&
        new Date(exec.started_at) < TEN_MINUTES_AGO
      ) {
        // Running for >10 minutes — mark as failed (likely crashed)
        await updateExecution(exec.id, {
          status: "failed",
          completed_at: new Date(),
          error: "Worker crashed during execution (stale recovery)",
        });
        console.log(
          `[worker] Marked stale execution ${exec.id} as failed`,
        );
      } else if (exec.status === "pending" || exec.status === "queued") {
        // Re-enqueue pending/queued tasks
        const task = await getTaskById(exec.task_id);
        if (task) {
          const redis = createClient({ url: REDIS_URL });
          await redis.connect();
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
          await redis.disconnect();
          console.log(
            `[worker] Re-enqueued stale execution ${exec.id}`,
          );
        } else {
          await updateExecution(exec.id, {
            status: "failed",
            completed_at: new Date(),
            error: "Task no longer exists (stale recovery)",
          });
        }
      }
    }
  } catch (err) {
    console.error("[worker] Stale recovery failed:", err);
  }
}
