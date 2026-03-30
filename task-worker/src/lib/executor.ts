import { generateText, stepCountIs } from "ai";
import { getModel } from "./ai-provider";
import { buildTools } from "./tools";
import { updateExecution } from "./db";
import { notifySuccess, notifyFailure, notifyTimeout } from "./notify";
import { sendNotificationEmail } from "./email";

interface TaskPayload {
  taskId: number;
  executionId: number;
  prompt: string;
  kbSlug: string | null;
  allowedTools: string[];
  maxToolCalls: number;
  timeoutSeconds: number;
  model?: string | null;
  taskName?: string;
  cronExpr?: string;
  notifyTo?: string | null;
  notifyFrom?: string | null;
}

interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
}

export async function executeTask(payload: TaskPayload): Promise<void> {
  const startTime = Date.now();
  const taskName = payload.taskName || `Task #${payload.taskId}`;

  await updateExecution(payload.executionId, {
    status: "running",
    started_at: new Date(),
  });

  // Build tools with execution context
  const allTools = buildTools(payload.executionId);
  const tools =
    payload.allowedTools.length > 0
      ? Object.fromEntries(
          Object.entries(allTools).filter(([k]) =>
            payload.allowedTools.includes(k),
          ),
        )
      : allTools;

  const systemPrompt = [
    "You are an autonomous task executor. The user has NO execution environment — they can only see your final summary and any files you create. You MUST use your tools to accomplish everything: search, compute, send emails, create files, etc. Never write code or instructions for the user to run manually.",
    "",
    "## executeCode sandbox rules",
    "- Each executeCode call runs in a fresh, isolated container with root access. No state persists between calls.",
    "- Files saved to /output/ are automatically uploaded and shown as downloads in the UI. Use this for all binary output (images, videos, PDFs, documents, archives, etc.).",
    "- The sandbox has internet access. You can curl/wget/pip install additional packages if needed.",
    "- Prefer language='bash' for CLI tasks (ffmpeg, yt-dlp, pandoc, jq, etc.). Use 'python' for data analysis, ML, and complex scripting.",
    "- If a task requires multiple executeCode calls that depend on each other's output, use createFile or /output/ to pass data between calls, or do everything in a single call.",
    "",
    "After completing all tool calls, write a brief summary of what you did and key findings. Never end with empty or control characters.",
    "",
    "Be concise and focused. Write in the same language as the user's instruction.",
    payload.kbSlug
      ? `You have access to knowledge base "${payload.kbSlug}".`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Collect per-tool durations via onStepFinish
  const toolCallLog: ToolCallLog[] = [];

  try {
    const result = await generateText({
      model: getModel(payload.model || undefined),
      system: systemPrompt,
      prompt: payload.prompt,
      tools,
      stopWhen: stepCountIs(payload.maxToolCalls),
      maxTokens: 8192,
      abortSignal: AbortSignal.timeout(payload.timeoutSeconds * 1000),
      onStepFinish(event) {
        const calls = event.toolCalls || [];
        const results = event.toolResults || [];
        for (let i = 0; i < calls.length; i++) {
          const tc = calls[i];
          const tr = results[i] as any;
          // AI SDK ToolResult: { type, toolCallId, toolName, output }
          const output = tr?.output !== undefined ? tr.output : tr?.result !== undefined ? tr.result : tr;
          const resultStr =
            typeof output === "string" ? output : JSON.stringify(output ?? "");
          toolCallLog.push({
            tool: tc.toolName,
            args: tc.args as Record<string, unknown>,
            result_summary: resultStr.slice(0, 200),
            duration_ms: 0,
          });
        }
      },
    });

    const executionMs = Date.now() - startTime;

    // Debug: log result structure
    console.log(`[executor] result.text: "${(result.text || "").slice(0, 100)}"`);
    console.log(`[executor] result.finishReason: ${result.finishReason}`);
    console.log(`[executor] steps: ${result.steps.length}, maxSteps: ${payload.maxToolCalls}`);
    for (const [i, step] of result.steps.entries()) {
      console.log(`[executor]   step[${i}]: finishReason=${step.finishReason} text="${(step.text || "").slice(0, 50)}" toolCalls=${step.toolCalls?.length ?? 0} toolResults=${step.toolResults?.length ?? 0}`);
    }

    // Use result.usage — Vertex AI uses inputTokens/outputTokens
    const usage = result.usage as Record<string, number> | undefined;
    const totalUsage = {
      prompt: usage?.promptTokens || usage?.inputTokens || 0,
      output: usage?.completionTokens || usage?.outputTokens || 0,
    };

    // result.text may be empty if last step was tool-only.
    // Fall back to last step with text content.
    let finalResult = result.text || "";
    if (!finalResult) {
      for (const step of result.steps) {
        if (step.text) {
          finalResult = step.text;
        }
      }
    }
    if (!finalResult) finalResult = "No response generated.";

    await updateExecution(payload.executionId, {
      status: "completed",
      completed_at: new Date(),
      prompt_tokens: totalUsage.prompt,
      output_tokens: totalUsage.output,
      tool_calls: toolCallLog,
      result: finalResult,
      execution_ms: executionMs,
    });

    await notifySuccess(
      payload.taskId,
      payload.executionId,
      taskName,
      finalResult,
    );
    await sendNotificationEmail({
      taskName,
      status: "success",
      result: finalResult,
      executionMs,
      toolCalls: toolCallLog,
      cronExpr: payload.cronExpr,
      executionId: payload.executionId,
      notifyTo: payload.notifyTo || undefined,
      notifyFrom: payload.notifyFrom || undefined,
    });

    console.log(
      `[executor] Task ${payload.taskId} completed in ${executionMs}ms (${toolCallLog.length} tool calls)`,
    );
  } catch (err) {
    const executionMs = Date.now() - startTime;
    const isTimeout =
      err instanceof Error && err.name === "AbortError";
    const errorMsg = isTimeout
      ? "Execution timed out"
      : err instanceof Error
        ? err.message
        : String(err);

    if (!isTimeout) {
      const stack = err instanceof Error ? err.stack : "";
      console.error(`[executor] Full error:`, stack || errorMsg);
    }

    await updateExecution(payload.executionId, {
      status: isTimeout ? "timeout" : "failed",
      completed_at: new Date(),
      tool_calls: toolCallLog,
      error: errorMsg,
      execution_ms: executionMs,
    });

    if (isTimeout) {
      await notifyTimeout(payload.taskId, payload.executionId, taskName);
    } else {
      await notifyFailure(
        payload.taskId,
        payload.executionId,
        taskName,
        errorMsg,
      );
    }

    await sendNotificationEmail({
      taskName,
      status: isTimeout ? "timeout" : "failure",
      error: errorMsg,
      executionMs,
      toolCalls: toolCallLog,
      cronExpr: payload.cronExpr,
      executionId: payload.executionId,
      notifyTo: payload.notifyTo || undefined,
      notifyFrom: payload.notifyFrom || undefined,
    });

    console.error(
      `[executor] Task ${payload.taskId} ${isTimeout ? "timed out" : "failed"} after ${executionMs}ms: ${errorMsg}`,
    );
  }
}
