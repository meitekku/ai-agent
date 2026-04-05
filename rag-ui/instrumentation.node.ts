import { cleanupOrphanFiles } from "@/lib/file-cleanup";
import { getTasksDueNow, createExecution, updateExecution, updateNextRunAt } from "@/lib/scheduler-db";
import { enqueueTask } from "@/lib/scheduler-queue";
import { syncBuiltInSkills } from "@/lib/built-in-skills";

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
        await updateNextRunAt(task.id, task.cron_expr, task.timezone);
        console.log(
          `[scheduler] Enqueued task ${task.id} "${task.name}" (execution ${executionId})`,
        );
      } catch (err) {
        console.error(`[scheduler] Failed to enqueue task ${task.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] Tick failed:", err);
  }
}

export function startNodeInstrumentation() {
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

  // Sync built-in skills on startup
  syncBuiltInSkills().catch((err) =>
    console.error("[startup] Built-in skills sync failed:", err),
  );

  // Scheduler: check for due tasks every 60 seconds
  setInterval(() => tickScheduler(), 60 * 1000);
  console.log("[startup] Scheduler ticker started (60s interval)");
}
