import { NextRequest, NextResponse } from "next/server";
import { getTask, createExecution, updateExecution } from "@/lib/scheduler-db";
import { enqueueTask } from "@/lib/scheduler-queue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const task = await getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const executionId = await createExecution(taskId);
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

    return NextResponse.json({ executionId });
  } catch (e) {
    console.error("POST /api/scheduler/[id]/run error:", e);
    return NextResponse.json({ error: "Failed to trigger" }, { status: 500 });
  }
}
