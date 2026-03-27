import { cleanupOrphanFiles } from "@/lib/file-cleanup";
import {
  getTasksDueNow,
  createExecution,
  updateExecution,
  updateNextRunAt,
} from "@/lib/scheduler-db";
import { enqueueTask } from "@/lib/scheduler-queue";

export async function onRequestInit() {
  // no-op: only need register hook
}

async function tickScheduler() {
  try {
    const dueTasks = await getTasksDueNow();
    if (dueTasks.length === 0) return;

    for (const task of dueTasks) {
      try {
        const executionId = await createExecution(task.id);
        await updateExecution(executionId, { status: "queued" });
        await enqueueTask({
          taskId: task.id,
          executionId,
          prompt: task.prompt,
          kbSlug: task.kb_slug,
          allowedTools: task.allowed_tools,
          maxToolCalls: task.max_tool_calls,
          timeoutSeconds: task.timeout_sec,
          model: task.model,
          notifyTo: task.notify_to,
          notifyFrom: task.notify_from,
        });
        await updateNextRunAt(task.id, task.cron_expr);
        console.log(
          `[scheduler] Enqueued task ${task.id} "${task.name}" (execution ${executionId})`,
        );
      } catch (err) {
        console.error(
          `[scheduler] Failed to enqueue task ${task.id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Tick failed:", err);
  }
}

export async function register() {
  // Clean up orphan files on startup, then every 6 hours
  cleanupOrphanFiles().catch((err) =>
    console.error("[startup] Orphan file cleanup failed:", err),
  );
  setInterval(
    () =>
      cleanupOrphanFiles().catch((err) =>
        console.error("[scheduled] Orphan file cleanup failed:", err),
      ),
    6 * 60 * 60 * 1000,
  );

  // Scheduler: check for due tasks every 60 seconds
  setInterval(() => tickScheduler(), 60 * 1000);
  console.log("[startup] Scheduler ticker started (60s interval)");
}
