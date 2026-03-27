import { NextRequest, NextResponse } from "next/server";
import { listExecutions, listExecutionFilesForTask } from "@/lib/scheduler-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const [executions, allFiles] = await Promise.all([
      listExecutions(taskId, limit),
      listExecutionFilesForTask(taskId, 200),
    ]);

    // Group files by execution_id
    const filesByExec = new Map<number, typeof allFiles>();
    for (const f of allFiles) {
      const arr = filesByExec.get(f.execution_id) || [];
      arr.push(f);
      filesByExec.set(f.execution_id, arr);
    }

    // Attach files to each execution
    const enriched = executions.map((e) => ({
      ...e,
      files: filesByExec.get(e.id) || [],
    }));

    return NextResponse.json({ executions: enriched });
  } catch (e) {
    console.error("GET /api/scheduler/[id]/executions error:", e);
    return NextResponse.json({ executions: [] });
  }
}
