import { generateContent, type Content } from "./gemini";
import { TOOL_DECLARATIONS, executeTool } from "./tools";
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
  args: Record<string, string>;
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

  // Filter tool declarations by allowed list
  const toolDecls =
    payload.allowedTools.length > 0
      ? TOOL_DECLARATIONS.filter((t) =>
          payload.allowedTools.includes(t.name),
        )
      : TOOL_DECLARATIONS;

  // Build system prompt
  const systemPrompt = [
    "You are an autonomous task executor. Complete the given task using the available tools.",
    "Be concise and focused. Report results clearly.",
    payload.kbSlug
      ? `You have access to knowledge base "${payload.kbSlug}".`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const contents: Content[] = [
    { role: "user", parts: [{ text: payload.prompt }] },
  ];

  const toolCallLog: ToolCallLog[] = [];
  let finalResult = "";
  let promptTokens = 0;
  let outputTokens = 0;

  try {
    const timeoutMs = payload.timeoutSeconds * 1000;

    for (let i = 0; i < payload.maxToolCalls; i++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        const executionMs = Date.now() - startTime;
        await updateExecution(payload.executionId, {
          status: "timeout",
          completed_at: new Date(),
          tool_calls: toolCallLog,
          error: "Execution timed out",
          execution_ms: executionMs,
        });
        await notifyTimeout(payload.taskId, payload.executionId, taskName);
        await sendNotificationEmail({
          taskName,
          status: "timeout",
          executionMs,
          toolCalls: toolCallLog,
          cronExpr: payload.cronExpr,
          executionId: payload.executionId,
        });
        return;
      }

      const result = await generateContent({
        contents,
        systemPrompt,
        tools: toolDecls,
        maxOutputTokens: 4000,
        modelOverride: payload.model || undefined,
      });

      promptTokens += result.promptTokens;
      outputTokens += result.outputTokens;

      // Check for function calls
      if (result.functionCalls.length > 0) {
        // Add model response to history (use _rawParts to preserve thought_signature)
        contents.push({
          role: "model",
          parts: result._rawParts || result.functionCalls.map((fc) => ({
            functionCall: { name: fc.name, args: fc.args },
          })),
        });

        // Execute each function call
        const functionResponses: Array<{
          functionResponse: { name: string; response: { result: string } };
        }> = [];

        for (const fc of result.functionCalls) {
          const toolStart = Date.now();

          console.log(
            `[executor] Task ${payload.taskId}: calling ${fc.name}(${JSON.stringify(fc.args).slice(0, 100)})`,
          );

          const toolResult = await executeTool(fc.name, fc.args);
          const toolDuration = Date.now() - toolStart;

          toolCallLog.push({
            tool: fc.name,
            args: fc.args,
            result_summary: toolResult.slice(0, 200),
            duration_ms: toolDuration,
          });

          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: { result: toolResult },
            },
          });
        }

        // Add function responses to history
        contents.push({
          role: "function",
          parts: functionResponses as any,
        });

        continue;
      }

      // No function calls — extract text response
      finalResult = result.text || "No response generated.";
      break;
    }

    const executionMs = Date.now() - startTime;
    await updateExecution(payload.executionId, {
      status: "completed",
      completed_at: new Date(),
      prompt_tokens: promptTokens,
      output_tokens: outputTokens,
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error(`[executor] Full error:`, stack || errorMsg);

    await updateExecution(payload.executionId, {
      status: "failed",
      completed_at: new Date(),
      tool_calls: toolCallLog,
      error: errorMsg,
      execution_ms: executionMs,
    });

    await notifyFailure(
      payload.taskId,
      payload.executionId,
      taskName,
      errorMsg,
    );
    await sendNotificationEmail({
      taskName,
      status: "failure",
      error: errorMsg,
      executionMs,
      toolCalls: toolCallLog,
      cronExpr: payload.cronExpr,
      executionId: payload.executionId,
      notifyTo: payload.notifyTo || undefined,
      notifyFrom: payload.notifyFrom || undefined,
    });

    console.error(
      `[executor] Task ${payload.taskId} failed after ${executionMs}ms:`,
      errorMsg,
    );
  }
}
