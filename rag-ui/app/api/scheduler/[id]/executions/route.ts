import { NextRequest, NextResponse } from "next/server";
import { listExecutions } from "@/lib/scheduler-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const executions = await listExecutions(parseInt(id, 10), limit);
    return NextResponse.json({ executions });
  } catch (e) {
    console.error("GET /api/scheduler/[id]/executions error:", e);
    return NextResponse.json({ executions: [] });
  }
}
