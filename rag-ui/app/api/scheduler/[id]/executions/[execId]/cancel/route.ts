import { NextRequest, NextResponse } from "next/server";
import { TASK_WORKER_URL } from "@/lib/constants";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; execId: string }> },
) {
  if (!TASK_WORKER_URL) {
    return NextResponse.json({ error: "Task worker not configured" }, { status: 503 });
  }
  try {
    const { execId } = await params;
    const res = await fetch(`${TASK_WORKER_URL}/executions/${execId}/cancel`, {
      method: "POST",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("POST /api/scheduler/[id]/executions/[execId]/cancel error:", e);
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }
}
