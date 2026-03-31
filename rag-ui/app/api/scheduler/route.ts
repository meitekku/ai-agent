import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask } from "@/lib/scheduler-db";

export async function GET() {
  try {
    const tasks = await listTasks();
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("GET /api/scheduler error:", e);
    return NextResponse.json({ tasks: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.cron_expr || !body.prompt) {
      return NextResponse.json(
        { error: "name, cron_expr, and prompt are required" },
        { status: 400 },
      );
    }
    const id = await createTask({
      name: body.name,
      description: body.description,
      cron_expr: body.cron_expr,
      timezone: body.timezone,
      prompt: body.prompt,
      kb_slug: body.kb_slug,
      allowed_tools: body.allowed_tools,
      max_tool_calls: body.max_tool_calls,
      timeout_sec: body.timeout_sec,
      retry_max: body.retry_max,
      model: body.model,
      notify_to: body.notify_to,
      notify_from: body.notify_from,
      enabled: body.enabled,
    });
    return NextResponse.json({ id });
  } catch (e) {
    console.error("POST /api/scheduler error:", e);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
