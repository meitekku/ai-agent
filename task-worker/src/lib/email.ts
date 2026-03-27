import { Resend } from "resend";
import { TaskResultEmail } from "./emails/task-result";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.APP_URL || "https://ai.wgzhao.me";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(RESEND_API_KEY);
  return resend;
}

interface ToolCall {
  tool: string;
  args: Record<string, string>;
  result_summary: string;
  duration_ms: number;
}

interface EmailParams {
  taskName: string;
  status: "success" | "failure" | "timeout";
  result?: string;
  error?: string;
  executionMs?: number;
  toolCalls?: ToolCall[];
  cronExpr?: string;
  executionId?: number;
  // Per-task email config
  notifyTo?: string;    // e.g. "tanaka@example.com"
  notifyFrom?: string;  // e.g. "XX会社 <noreply@yourdomain.com>" (must be Resend verified domain)
}

export async function sendNotificationEmail(params: EmailParams): Promise<void> {
  const client = getResend();
  if (!client || !params.notifyTo) return;

  try {
    const statusLabels = {
      success: "Completed",
      failure: "Failed",
      timeout: "Timed Out",
    };

    const from = params.notifyFrom || "FG ZhaoWenguang <noreply@wgzhao.me>";

    const { error } = await client.emails.send({
      from,
      to: params.notifyTo,
      subject: `Task "${params.taskName}" — ${statusLabels[params.status]}`,
      react: TaskResultEmail({
        taskName: params.taskName,
        status: params.status,
        result: params.result,
        error: params.error,
        executionMs: params.executionMs,
        toolCalls: params.toolCalls,
        cronExpr: params.cronExpr,
        executionId: params.executionId,
        appUrl: APP_URL,
      }),
    });

    if (error) {
      console.error("[email] Resend API error:", error);
      return;
    }

    console.log(`[email] Sent notification to ${params.notifyTo}`);
  } catch (err) {
    console.error("[email] Failed to send notification:", err);
  }
}
