import { generateText, stepCountIs } from "ai";
import { getModel, googleSearchTool } from "./ai-provider";
import { buildTools, listKBs, TAVILY_API_KEY } from "./tools";
import { updateExecution } from "./db";
import { notifySuccess, notifyFailure, notifyTimeout } from "./notify";
import { sendNotificationEmail } from "./email";
import { getEnabledSkillSummaries, type SkillSummary } from "./skills-db";

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
  retryCount?: number;
}

interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
}

// Tools that are user-filterable via allowedTools
const FILTERABLE_TOOLS = [
  "searchKnowledgeBase",
  "webSearch",
  "readUrl",
  "crmApi",
  "executeCode",
  "createFile",
  "sendEmail",
  "generateImage",
  "analyzeImage",
  "readFile",
  "httpRequest",
  "queryDatabase",
  "editFile",
  "listFiles",
  "grepFiles",
];

function buildSkillsPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) return "";
  const list = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");
  return `\n\n## Available Skills (use proactively)\n\nThe following skills are enabled. If the user's task is related to any of them, call \`loadSkill\` immediately to load the full instructions — do NOT ask the user first. Using a skill costs little; missing one degrades quality.\n\n${list}`;
}

export async function executeTask(payload: TaskPayload): Promise<'completed' | 'failed' | 'timeout'> {
  const startTime = Date.now();
  const taskName = payload.taskName || `Task #${payload.taskId}`;

  await updateExecution(payload.executionId, {
    status: "running",
    started_at: new Date(),
  });

  // Fetch skills and KB list in parallel before execution
  const [skills, kbList] = await Promise.all([
    getEnabledSkillSummaries(),
    payload.kbSlug ? Promise.resolve([]) : listKBs(),
  ]);

  if (skills.length > 0) {
    console.log(`[executor] 📚 ${skills.length} skills available: ${skills.map((s) => s.name).join(", ")}`);
  }
  if (kbList.length > 0) {
    console.log(`[executor] 🗂️ KB auto-discovery: ${kbList.length} KBs: ${kbList.map((k) => k.slug).join(", ")}`);
  }

  // Build full tools map
  const allTools = buildTools({
    executionId: payload.executionId,
    skills,
    kbList,
    kbSlug: payload.kbSlug,
  });

  // Apply allowedTools filter only to filterable tools;
  // loadSkill and generateImage (when skills/image model exist) follow the filter,
  // but loadSkill is always kept since it's meta-tooling.
  let tools: Record<string, unknown>;
  if (payload.allowedTools.length > 0) {
    tools = Object.fromEntries(
      Object.entries(allTools).filter(
        ([k]) =>
          !FILTERABLE_TOOLS.includes(k) || payload.allowedTools.includes(k),
      ),
    );
  } else {
    tools = { ...allTools };
  }

  // Add Google Search grounding as implicit fallback when Tavily is not set.
  // Not user-filterable — it's a transparent capability upgrade.
  const hasGoogleSearch = !TAVILY_API_KEY && !!googleSearchTool;
  if (hasGoogleSearch) {
    (tools as Record<string, unknown>).google_search = googleSearchTool;
  }

  // Build system prompt
  const webSearchNote = TAVILY_API_KEY
    ? "- Use webSearch for current/public information, then readUrl to get full page content."
    : hasGoogleSearch
      ? "- Use google_search for current/public information (built-in Gemini search, no extra API key needed)."
      : "- Web search is not configured. Use searchKnowledgeBase for internal information.";

  const kbNote = payload.kbSlug
    ? `You have access to knowledge base "${payload.kbSlug}".`
    : kbList.length > 0
      ? `You have access to ${kbList.length} knowledge base(s). Use searchKnowledgeBase and select the most relevant KB.`
      : "";

  const systemPrompt = [
    `You are an autonomous task executor running inside a **scheduled task system**. Today is **${new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Tokyo" })}**. You are already being executed by a cron scheduler — your job is to DO the work right now, not to build automation for later. Never create scripts, cron configs, GitHub Actions, README guides, or any "system" for the user to set up manually. The scheduler will re-run you on the next scheduled time automatically.`,
    "",
    "The user has NO execution environment — they can only see your final summary and any files you create. You MUST use your tools to accomplish everything: search, compute, send emails, create files, etc. Never write code or instructions for the user to run manually.",
    "",
    "When searching for current/recent information, always include temporal context (e.g. today's date, \"this week\", \"March 2026\") in your search queries to avoid getting outdated results.",
    "",
    "## executeCode sandbox rules",
    "- Each executeCode call runs in a fresh, isolated container with root access. No state persists between calls.",
    "- Files saved to /output/ are automatically uploaded and shown as downloads in the UI. Use this for all binary output (images, videos, PDFs, documents, archives, etc.).",
    "- The sandbox has internet access. Use `uv pip install` (not pip) to install additional packages at runtime — it's pre-installed and much faster.",
    "- When downloading video/audio with yt-dlp, always use `-f 'bestvideo+bestaudio/best' --merge-output-format mp4` for video, or `-f 'bestaudio/best' --extract-audio --audio-format mp3` for audio-only. Never use default format without -f.",
    "- Prefer language='bash' for CLI tasks. Use 'python' for data analysis, ML, and complex scripting.",
    "- Excel files MUST use .xlsx format (not .xls). Use openpyxl or xlsxwriter. Example: `df.to_excel('/output/report.xlsx', index=False, engine='openpyxl')`.",
    "- If a task requires multiple executeCode calls that depend on each other's output, do everything in a single call.",
    "",
    "## Tool usage",
    webSearchNote,
    kbNote,
    "- Use analyzeImage to understand visual content: photos, screenshots, charts, scanned documents. It can OCR text, describe charts, identify objects.",
    "- Use readFile to read back files from previous steps (e.g., review a generated CSV, inspect an uploaded PDF).",
    "- Use editFile to modify existing files: find-and-replace text, append/prepend content, insert lines. Original file is preserved, a new version is created.",
    "- Use listFiles to discover files from the current or past executions. Use grepFiles to search across multiple files with regex patterns.",
    "- Use httpRequest for external REST APIs (weather, exchange rates, webhooks, etc.) not covered by other tools.",
    "- Use queryDatabase for precise data retrieval from PostgreSQL (statistics, aggregations, filtering). Read-only queries only.",
    "",
    "After completing all tool calls, write a brief summary of what you did and key findings. Never end with empty or control characters.",
    "",
    "Be concise and focused. Write in the same language as the user's instruction.",
    buildSkillsPrompt(skills),
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
      tools: tools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: stepCountIs(payload.maxToolCalls),
      maxOutputTokens: 32768,
      abortSignal: AbortSignal.timeout(payload.timeoutSeconds * 1000),
      onStepFinish(event) {
        const calls = event.toolCalls || [];
        const results = event.toolResults || [];
        for (let i = 0; i < calls.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tc = calls[i] as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tr = results[i] as any;
          const output =
            tr?.output !== undefined
              ? tr.output
              : tr?.result !== undefined
                ? tr.result
                : tr;
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

    // Use result.usage — Vertex AI uses inputTokens/outputTokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = result.usage as any;
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
      tool_calls: toolCallLog as unknown[],
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
    return 'completed';
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
      tool_calls: toolCallLog as unknown[],
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
    return isTimeout ? 'timeout' : 'failed';
  }
}
