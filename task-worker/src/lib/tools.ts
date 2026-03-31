import { generateImage as aiGenerateImage, generateText, tool } from "ai";
import { z } from "zod";
import pg from "pg";
import { Resend } from "resend";
import { executeCode } from "./sandbox";
import { AiEmail } from "./emails/ai-email";
import { getImageModel, getModel, providerOptionsKey } from "./ai-provider";
import { type SkillSummary, getSkillByName } from "./skills-db";
import { guessMimeType } from "./mime";

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://lightrag:8007";
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || "http://crm-service:8009";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const RAG_UI_URL = process.env.RAG_UI_URL || "http://rag-ui:3000";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "FG ZhaoWenguang <noreply@wgzhao.me>";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

// Lazy read-only pool for queryDatabase
let roPool: pg.Pool | null = null;
function getReadOnlyPool(): pg.Pool {
  if (!roPool) {
    roPool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  }
  return roPool;
}

export { TAVILY_API_KEY };

// ============================================================
// KB auto-discovery helpers
// ============================================================

export interface KBInfo {
  slug: string;
  name: string;
  description?: string;
  doc_count: number;
}

export async function listKBs(): Promise<KBInfo[]> {
  try {
    const res = await fetch(`${LIGHTRAG_URL}/kbs`);
    if (!res.ok) return [];
    const data = await res.json();
    const kbs: KBInfo[] = data.knowledge_bases ?? data ?? [];
    return kbs.filter((k) => k.doc_count > 0);
  } catch {
    return [];
  }
}

// ============================================================
// Tool definitions
// ============================================================

export interface BuildToolsOptions {
  executionId: number;
  /** Enabled skills for loadSkill tool — omit or pass [] to skip */
  skills?: SkillSummary[];
  /** Available KBs for auto-discovery — omit or pass [] to use generic search */
  kbList?: KBInfo[];
  /** Fixed KB slug (overrides kbList when set) */
  kbSlug?: string | null;
}

export function buildTools({
  executionId,
  skills = [],
  kbList = [],
  kbSlug,
}: BuildToolsOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // ---- searchKnowledgeBase ----------------------------------------
  if (kbSlug) {
    // Fixed KB mode
    tools.searchKnowledgeBase = tool({
      description: `Search the internal knowledge base "${kbSlug}" (RAG) for relevant information. Returns excerpts from indexed documents. Use when: the task requires domain-specific or internal information (company docs, manuals, policies, past reports). Do not use when: the question is about general/public knowledge — use webSearch instead.`,
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => searchKnowledgeBase(query, kbSlug),
    });
  } else if (kbList.length > 0) {
    // Auto-discovery mode: AI chooses which KB to search
    const kbDescriptions = kbList
      .map(
        (k) =>
          `- \`${k.slug}\`: ${k.name}${k.description ? ` — ${k.description}` : ""} (${k.doc_count} docs)`,
      )
      .join("\n");
    const slugs = kbList.map((k) => k.slug) as [string, ...string[]];

    tools.searchKnowledgeBase = tool({
      description: `Search the internal knowledge base (RAG) for relevant information. Select the most relevant KB for the query.\n\nAvailable knowledge bases:\n${kbDescriptions}\n\nUse when: the task requires domain-specific or internal information. Do not use when: the question is about general/public knowledge — use webSearch instead.`,
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        kb: z.enum(slugs).describe("Knowledge base slug to search"),
      }),
      execute: async ({ query, kb }) => searchKnowledgeBase(query, kb),
    });
  } else {
    // Generic mode: no specific KB configured, searches all
    tools.searchKnowledgeBase = tool({
      description:
        "Search the internal knowledge base (RAG) for relevant information. Returns excerpts from indexed documents. Use when: the task requires domain-specific or internal information (company docs, manuals, policies, past reports). Do not use when: the question is about general/public knowledge — use webSearch instead. If kb is omitted, searches all knowledge bases.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        kb: z
          .string()
          .optional()
          .describe(
            "Knowledge base slug to search within. Omit to search all KBs.",
          ),
      }),
      execute: async ({ query, kb }) => searchKnowledgeBase(query, kb),
    });
  }

  // ---- webSearch --------------------------------------------------
  tools.webSearch = tool({
    description:
      "Search the web for current, real-time information. Returns top results with snippets and URLs. Use when: the task needs up-to-date information (news, stock prices, weather, recent events) or public knowledge not in the knowledge base. Do not use when: the information is likely in the internal knowledge base — use searchKnowledgeBase first. Prefer this over readUrl when you don't have a specific URL yet.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
    }),
    execute: async ({ query }) => webSearch(query),
  });

  // ---- readUrl ----------------------------------------------------
  tools.readUrl = tool({
    description:
      "Fetch and extract the text content of a specific web page. Use when: you already have a URL (from webSearch results, user input, or a known source) and need its full content. Do not use when: you need to discover pages — use webSearch first to find relevant URLs, then readUrl to get details.",
    inputSchema: z.object({
      url: z.string().describe("The URL to read"),
    }),
    execute: async ({ url }) => readUrl(url),
  });

  // ---- crmApi -----------------------------------------------------
  tools.crmApi = tool({
    description:
      "Call the CRM service API. Available endpoints: Salesforce — POST /sf/check (connection test), /sf/list (list opportunities), /sf/fetch (fetch deal details); Kintone — POST /kintone/list, /kintone/fetch; Analysis — POST /deals/analyze (AI scoring), /deals/parse-file (parse uploaded deal files), /deals/revise-rationale, /deals/solution-qa; Templates — GET /templates, POST /templates, POST /templates/detect; Proposals — POST /proposal/generate-plan, /proposal/render-pptx, /proposal/revise-slide. Use when: the task involves CRM data, deal analysis, or proposal generation. Do not use when: the task has nothing to do with sales/CRM data. Important: Salesforce and Kintone are separate CRM systems — only call the one the user specified. Do not mix them unless the user explicitly asks to reference both.",
    inputSchema: z.object({
      endpoint: z
        .string()
        .describe(
          "CRM endpoint path, e.g. /sf/list, /deals/analyze, /kintone/fetch",
        ),
      body: z
        .string()
        .optional()
        .describe("JSON body string for the POST request"),
    }),
    execute: async ({ endpoint, body }) => crmApi(endpoint, body),
  });

  // ---- executeCode ------------------------------------------------
  tools.executeCode = tool({
    description:
      "Execute code in an isolated sandbox container with a full bash environment. IMPORTANT: Any files saved to /output/ will be automatically uploaded and made available for download by the user. Use this for binary files (videos, images, PDFs, archives, etc.) that cannot be passed as text. Prefer language='bash' for CLI-centric tasks (piping, file manipulation, media processing). CLI tools: ffmpeg (video/audio), imagemagick/convert (image processing), graphviz/dot (graph diagrams), gnuplot (plots), pandoc (document conversion: md→docx/pdf/html), weasyprint (HTML→PDF), curl, wget, httpie (HTTP), jq (JSON), xmlstarlet (XML), csvkit/csvlook/csvsql (CSV querying), miller/mlr (CSV/JSON transform), ripgrep/rg (fast search), sqlite3 (SQL), yt-dlp (video download), gallery-dl (image download), git, zip, bc, tree. Python packages: numpy, scipy, pandas, matplotlib, seaborn, plotly (interactive charts), scikit-learn (ML), openpyxl, xlsxwriter, requests, beautifulsoup4, lxml, feedparser (RSS), yfinance (stock data), tabulate, Pillow, pydantic, python-docx (Word), reportlab (PDF), sympy (math). Use when: the task requires computation, data processing, file conversion, media processing, web scraping, ML, chart generation, or any logic too complex for the LLM alone. Do not use when: the answer can be derived from reasoning alone without running code.",
    inputSchema: z.object({
      language: z
        .string()
        .describe(
          "Language: 'bash' for shell commands & CLI tools, 'python' for data/ML/scripting, 'javascript' for Node.js, 'typescript' for Node.js with native TS support",
        ),
      code: z.string().describe("The code to execute"),
    }),
    execute: async ({ language, code }) => runCode(language, code, executionId),
  });

  // ---- createFile -------------------------------------------------
  tools.createFile = tool({
    description:
      "Save a file artifact that the user can download later. Use when: the task produces structured output (CSV, JSON, Markdown report, Excel, etc.) or any content the user will want to keep. You can call this multiple times to create multiple files. Do not use when: the user asked to send results by email — use sendEmail instead.",
    inputSchema: z.object({
      filename: z
        .string()
        .describe(
          "File name with extension, e.g. report.md, data.csv, summary.json",
        ),
      content: z.string().describe("File content as text"),
      mediaType: z
        .string()
        .optional()
        .describe(
          "MIME type, e.g. text/csv, application/json. Auto-detected from extension if omitted.",
        ),
    }),
    execute: async ({ filename, content, mediaType }) =>
      createFile(filename, content, mediaType, executionId),
  });

  // ---- sendEmail --------------------------------------------------
  tools.sendEmail = tool({
    description:
      "Send an email to the specified recipient. Body supports Markdown (headings, lists, bold, code blocks, blockquotes, etc.) and will be rendered as a styled HTML email. Use when: the user explicitly asks to send/email results to someone, or the task prompt specifies an email recipient. Do not use when: the user only asks for a report or summary without mentioning email — use createFile instead.",
    inputSchema: z.object({
      to: z
        .string()
        .describe("Recipient email address, e.g. user@example.com"),
      subject: z.string().describe("Email subject line"),
      body: z
        .string()
        .describe(
          "Email body in Markdown format. Use headings, lists, bold, code blocks, etc. for rich formatting.",
        ),
    }),
    execute: async ({ to, subject, body }) => sendEmail(to, subject, body),
  });

  // ---- generateImage (optional — only when image model available) --
  const imageModel = getImageModel();
  if (imageModel) {
    tools.generateImage = tool({
      description:
        "Generate an image from a text prompt using Gemini Imagen. The image is automatically uploaded and made available as a downloadable file. Use when: the task requires creating an illustration, diagram image, chart visual, or any custom image. Write the prompt in English for best quality. Do not use when: the image can be generated via executeCode (e.g., matplotlib charts) — prefer executeCode for data-driven visuals.",
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            "Image generation prompt in English. Be specific about style, subject, composition.",
          ),
        aspectRatio: z
          .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
          .optional()
          .describe("Aspect ratio (default: 1:1)"),
      }),
      execute: async ({ prompt, aspectRatio }) =>
        runGenerateImage(prompt, aspectRatio ?? "1:1", executionId),
    });
  }

  // ---- analyzeImage -----------------------------------------------
  tools.analyzeImage = tool({
    description:
      "Analyze an image using Gemini Vision. Can describe contents, extract text (OCR), read charts/tables, identify objects, or answer questions about the image. Input can be: (1) a URL to an image, (2) a fileId from a previous createFile/executeCode/generateImage result. Use when: the task requires understanding visual content — photos, screenshots, charts, diagrams, scanned documents. Do not use when: you only need to generate an image (use generateImage) or the image is already described in text.",
    inputSchema: z.object({
      source: z
        .string()
        .describe(
          "Image URL (https://...) or fileId from a previous tool result",
        ),
      question: z
        .string()
        .optional()
        .describe(
          "Specific question about the image. If omitted, provides a general description.",
        ),
    }),
    execute: async ({ source, question }) =>
      analyzeImage(source, question),
  });

  // ---- readFile ---------------------------------------------------
  tools.readFile = tool({
    description:
      "Read the content of a previously created or uploaded file. Accepts a fileId returned by createFile, executeCode (/output/ files), or generateImage. Returns text content for text files (CSV, JSON, Markdown, etc.) or a base64 data URL for binary files (images, PDF). Use when: you need to read back a file from a previous step (e.g., review a generated CSV, read an uploaded document). Do not use when: you need to read a web page (use readUrl instead).",
    inputSchema: z.object({
      fileId: z
        .string()
        .describe("File ID from a previous createFile/executeCode/generateImage result"),
    }),
    execute: async ({ fileId }) => readFile(fileId),
  });

  // ---- httpRequest ------------------------------------------------
  tools.httpRequest = tool({
    description:
      "Make an HTTP request to any URL. Supports GET, POST, PUT, PATCH, DELETE with custom headers and body. Use when: you need to call an external REST API (weather, exchange rates, stock data, webhooks, etc.), interact with a service that is not covered by other tools, or send data to a webhook/endpoint. Do not use when: you need to search the web (use webSearch), read a web page (use readUrl), call the CRM API (use crmApi), or call the knowledge base (use searchKnowledgeBase). Security: do not send credentials or tokens unless the user explicitly provides them.",
    inputSchema: z.object({
      url: z.string().describe("The full URL to request"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .describe("HTTP method (default: GET)"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("HTTP headers as key-value pairs, e.g. {\"Authorization\": \"Bearer xxx\"}"),
      body: z
        .string()
        .optional()
        .describe("Request body (string). For JSON, stringify the object first."),
    }),
    execute: async ({ url, method, headers, body }) =>
      httpRequest(url, method ?? "GET", headers, body),
  });

  // ---- queryDatabase ----------------------------------------------
  tools.queryDatabase = tool({
    description:
      "Execute a READ-ONLY SQL query against the PostgreSQL database. The query runs inside a READ ONLY transaction with a 10-second timeout. Available tables include: scheduled_tasks, task_executions, task_notifications, chat_conversations, chat_messages, chat_files, slide_decks, slide_pages, skills, knowledge_bases, ingest_jobs. Use when: the task requires precise data retrieval, aggregation, filtering, or reporting from the database (e.g., 'how many tasks ran this week', 'list failed executions', 'chat message statistics'). Do not use when: the task is about searching document content (use searchKnowledgeBase) or the query would modify data (INSERT/UPDATE/DELETE are blocked).",
    inputSchema: z.object({
      sql: z
        .string()
        .describe(
          "SQL SELECT query. Must be read-only (SELECT, WITH ... SELECT, EXPLAIN). INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE are rejected.",
        ),
    }),
    execute: async ({ sql }) => queryDatabase(sql),
  });

  // ---- editFile ---------------------------------------------------
  tools.editFile = tool({
    description:
      "Edit an existing file by applying text operations. Reads the file by fileId, applies the operation, and saves the result as a new file (original is preserved). Supported operations: 'replace' (find-and-replace, supports multiple occurrences), 'append' (add text at end), 'prepend' (add text at beginning), 'insertAfter' (insert text after a matching line). Use when: you need to modify a previously created file (e.g., add rows to a CSV, update JSON, fix text). Do not use when: you need to create a file from scratch (use createFile) or the file is binary (use executeCode).",
    inputSchema: z.object({
      fileId: z
        .string()
        .describe("File ID from a previous createFile/executeCode result"),
      operation: z
        .enum(["replace", "append", "prepend", "insertAfter"])
        .describe("Edit operation type"),
      search: z
        .string()
        .optional()
        .describe("For 'replace': text to find. For 'insertAfter': line to match."),
      replacement: z
        .string()
        .describe("For 'replace': replacement text. For 'append'/'prepend'/'insertAfter': text to insert."),
      replaceAll: z
        .boolean()
        .optional()
        .describe("For 'replace': replace all occurrences (default: first only)"),
    }),
    execute: async ({ fileId, operation, search, replacement, replaceAll }) =>
      editFile(fileId, operation, search, replacement, replaceAll, executionId),
  });

  // ---- listFiles --------------------------------------------------
  tools.listFiles = tool({
    description:
      "List files from the current or past task executions. Returns file metadata (fileId, filename, mediaType, size, date). Use when: you need to find a file from a previous step or past execution to read/edit/analyze. Can filter by execution ID or list all recent files.",
    inputSchema: z.object({
      executionId: z
        .number()
        .optional()
        .describe("Filter by specific execution ID. Omit to list files from the current execution."),
      includeAllRecent: z
        .boolean()
        .optional()
        .describe("Set true to list recent files across all executions (last 50)"),
    }),
    execute: async ({ executionId: execId, includeAllRecent }) =>
      listFiles(execId ?? executionId, !!includeAllRecent),
  });

  // ---- grepFiles --------------------------------------------------
  tools.grepFiles = tool({
    description:
      "Search through text file contents using a regex pattern. Searches across files from the current or specified execution. Returns matching lines with context. Use when: you need to find specific content across multiple files (e.g., 'find all error entries in logs', 'search for a keyword across CSV files'). Do not use when: you only need to read one specific file (use readFile).",
    inputSchema: z.object({
      pattern: z
        .string()
        .describe("Regular expression pattern to search for (case-insensitive)"),
      executionId: z
        .number()
        .optional()
        .describe("Execution ID to search files from. Omit for current execution."),
      fileId: z
        .string()
        .optional()
        .describe("Search within a single specific file only"),
    }),
    execute: async ({ pattern, executionId: execId, fileId }) =>
      grepFiles(pattern, execId ?? executionId, fileId),
  });

  // ---- loadSkill (optional — only when skills are available) ------
  if (skills.length > 0) {
    tools.loadSkill = tool({
      description:
        "Load the full instructions for a skill. Call this proactively when the user's task matches an available skill — do not ask the user first. Skills provide domain knowledge and workflow instructions that improve task quality.",
      inputSchema: z.object({
        name: z.string().describe("The skill name to load"),
      }),
      execute: async ({ name }) => {
        const known = skills.find(
          (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (!known) {
          return { error: `Skill "${name}" not found in available skills` };
        }
        console.log(`[tools] 📖 loadSkill: ${name}`);
        const skill = await getSkillByName(name);
        if (!skill) return { error: `Skill "${name}" not found` };
        return { name: skill.name, content: skill.content };
      },
    });
  }

  return tools;
}

// ============================================================
// Tool execution functions
// ============================================================

async function searchKnowledgeBase(
  query: string,
  kb?: string,
): Promise<string> {
  const url = `${LIGHTRAG_URL}/query/search-only${kb ? `?kb=${encodeURIComponent(kb)}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: query,
      ll_keywords: [query],
      mode: "hybrid",
      top_k: 8,
      only_need_context: true,
    }),
  });
  if (!res.ok)
    return JSON.stringify({ error: `KB search failed: ${res.status}` });
  const data = await res.json();
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.slice(0, 8000);
}

async function webSearch(query: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    return JSON.stringify({
      error: "Web search unavailable: TAVILY_API_KEY not set",
    });
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: 5,
      include_answer: true,
    }),
  });
  if (!res.ok)
    return JSON.stringify({ error: `Web search failed: ${res.status}` });
  const data = await res.json();
  const results = (data.results || [])
    .map((r: { title: string; url: string; content: string }) => `${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n");
  return (
    (data.answer ? `Answer: ${data.answer}\n\n` : "") +
    results.slice(0, 6000)
  );
}

async function readUrl(url: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "task-worker/1.0" },
      });
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 8000);
    } catch (err) {
      return JSON.stringify({ error: `Failed to read URL: ${err}` });
    }
  }
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: TAVILY_API_KEY, urls: [url] }),
  });
  if (!res.ok)
    return JSON.stringify({ error: `URL read failed: ${res.status}` });
  const data = await res.json();
  const content =
    data.results?.[0]?.raw_content || data.results?.[0]?.text || "";
  return content.slice(0, 8000);
}

async function crmApi(endpoint: string, body?: string): Promise<string> {
  const url = `${CRM_SERVICE_URL}${endpoint}`;
  const isGet = !body;
  const res = await fetch(url, {
    method: isGet ? "GET" : "POST",
    headers: isGet ? undefined : { "Content-Type": "application/json" },
    body: isGet ? undefined : body,
  });
  if (!res.ok)
    return JSON.stringify({ error: `CRM API failed: ${res.status}` });
  const data = await res.json();
  return JSON.stringify(data).slice(0, 8000);
}

async function runCode(
  language: string,
  code: string,
  executionId: number,
): Promise<string> {
  try {
    const result = await executeCode(language, code, executionId);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: `Code execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function createFile(
  filename: string,
  content: string,
  mediaType: string | undefined,
  executionId: number,
): Promise<string> {
  try {
    const mime = mediaType || guessMimeType(filename);
    const form = new FormData();
    form.append("file", new Blob([content], { type: mime }), filename);
    form.append("filename", filename);
    form.append("mediaType", mime);
    form.append("executionId", String(executionId));

    const res = await fetch(`${RAG_UI_URL}/api/task-files`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return JSON.stringify({
        error: `Failed to save file: ${res.status} ${err}`,
      });
    }

    const data = await res.json();
    return JSON.stringify({
      success: true,
      fileId: data.fileId,
      filename: data.filename,
      size: data.size,
      url: data.url,
    });
  } catch (err) {
    return JSON.stringify({
      error: `createFile failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  if (!RESEND_API_KEY) {
    return JSON.stringify({
      error: "Email unavailable: RESEND_API_KEY not configured",
    });
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      react: AiEmail({ subject, body }),
    });
    if (error) {
      return JSON.stringify({ error: `Resend API error: ${error.message}` });
    }
    return JSON.stringify({ success: true, emailId: data?.id, to, subject });
  } catch (err) {
    return JSON.stringify({
      error: `sendEmail failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function runGenerateImage(
  prompt: string,
  aspectRatio: string,
  executionId: number,
): Promise<string> {
  const imageModel = getImageModel();
  if (!imageModel) {
    return JSON.stringify({ error: "Image generation not available" });
  }
  try {
    const { image } = await aiGenerateImage({
      model: imageModel,
      prompt,
      aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
    });

    const filename = `generated-${Date.now()}.png`;
    const form = new FormData();
    form.append(
      "file",
      new Blob([image.uint8Array.buffer as ArrayBuffer], { type: "image/png" }),
      filename,
    );
    form.append("filename", filename);
    form.append("mediaType", "image/png");
    form.append("executionId", String(executionId));

    const res = await fetch(`${RAG_UI_URL}/api/task-files`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      return JSON.stringify({ error: `Failed to upload generated image: ${res.status}` });
    }

    const data = await res.json();
    return JSON.stringify({
      success: true,
      fileId: data.fileId,
      filename,
      url: data.url,
    });
  } catch (err) {
    return JSON.stringify({
      error: `generateImage failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ============================================================
// New tool execution functions
// ============================================================

async function analyzeImage(
  source: string,
  question?: string,
): Promise<string> {
  try {
    // Resolve source: fileId → fetch binary, URL → fetch binary
    let imageData: Uint8Array;
    let mimeType = "image/png";

    if (source.startsWith("http://") || source.startsWith("https://")) {
      const res = await fetch(source, {
        headers: { "User-Agent": "task-worker/1.0" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok)
        return JSON.stringify({ error: `Failed to fetch image: ${res.status}` });
      mimeType = res.headers.get("content-type") || "image/png";
      imageData = new Uint8Array(await res.arrayBuffer());
    } else {
      // Treat as fileId — fetch from rag-ui
      const res = await fetch(`${RAG_UI_URL}/api/task-files/${source}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        // Fallback: try /api/files/{id}
        const res2 = await fetch(`${RAG_UI_URL}/api/files/${source}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res2.ok)
          return JSON.stringify({ error: `File not found: ${source}` });
        mimeType = res2.headers.get("content-type") || "image/png";
        imageData = new Uint8Array(await res2.arrayBuffer());
      } else {
        mimeType = res.headers.get("content-type") || "image/png";
        imageData = new Uint8Array(await res.arrayBuffer());
      }
    }

    console.log(`[tools] 👁️ analyzeImage: ${imageData.length} bytes, ${mimeType}`);

    const prompt = question || "Describe this image in detail. If it contains text, extract it. If it contains charts or tables, describe the data.";

    const result = await generateText({
      model: getModel(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image" as const,
              image: imageData,
              mediaType: mimeType,
            },
            { type: "text" as const, text: prompt },
          ],
        },
      ],
    });

    return JSON.stringify({
      success: true,
      analysis: result.text || "No analysis generated.",
    });
  } catch (err) {
    return JSON.stringify({
      error: `analyzeImage failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function readFile(fileId: string): Promise<string> {
  try {
    // Try task-files first, then chat-files
    let res = await fetch(`${RAG_UI_URL}/api/task-files/${fileId}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      res = await fetch(`${RAG_UI_URL}/api/files/${fileId}`, {
        signal: AbortSignal.timeout(15000),
      });
    }
    if (!res.ok) {
      return JSON.stringify({ error: `File not found: ${fileId} (${res.status})` });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const contentDisposition = res.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
    const filename = filenameMatch ? filenameMatch[1] : fileId;

    // Text-based files: return content directly
    if (
      contentType.startsWith("text/") ||
      contentType.includes("json") ||
      contentType.includes("xml") ||
      contentType.includes("csv") ||
      contentType.includes("markdown")
    ) {
      const text = await res.text();
      return JSON.stringify({
        success: true,
        filename,
        mediaType: contentType,
        content: text.slice(0, 50000),
        truncated: text.length > 50000,
      });
    }

    // Binary files: return size info + base64 preview for small images
    const buf = await res.arrayBuffer();
    const size = buf.byteLength;

    if (contentType.startsWith("image/") && size < 2 * 1024 * 1024) {
      // Small images: return as base64 data URL for analysis
      const base64 = Buffer.from(buf).toString("base64");
      return JSON.stringify({
        success: true,
        filename,
        mediaType: contentType,
        size,
        dataUrl: `data:${contentType};base64,${base64}`,
      });
    }

    return JSON.stringify({
      success: true,
      filename,
      mediaType: contentType,
      size,
      note: "Binary file. Use analyzeImage for images, or executeCode to process this file.",
    });
  } catch (err) {
    return JSON.stringify({
      error: `readFile failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function httpRequest(
  url: string,
  method: string,
  headers?: Record<string, string>,
  body?: string,
): Promise<string> {
  try {
    console.log(`[tools] 🌐 httpRequest: ${method} ${url}`);
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent": "task-worker/1.0",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    });

    const contentType = res.headers.get("content-type") || "";
    let responseBody: string;

    if (contentType.includes("json")) {
      const data = await res.json();
      responseBody = JSON.stringify(data);
    } else {
      responseBody = await res.text();
    }

    // Truncate large responses
    if (responseBody.length > 12000) {
      responseBody = responseBody.slice(0, 12000) + "\n...(truncated)";
    }

    return JSON.stringify({
      status: res.status,
      statusText: res.statusText,
      contentType,
      body: responseBody,
    });
  } catch (err) {
    return JSON.stringify({
      error: `httpRequest failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

const WRITE_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|VACUUM|CLUSTER|REINDEX|COMMENT|SECURITY|SET\s+ROLE)/i;

async function queryDatabase(sql: string): Promise<string> {
  // Block write operations at the application level
  if (WRITE_PATTERN.test(sql)) {
    return JSON.stringify({
      error: "Write operations are not allowed. Only SELECT queries are permitted.",
    });
  }

  const client = await getReadOnlyPool().connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    await client.query("BEGIN READ ONLY");

    const result = await client.query(sql);

    await client.query("COMMIT");

    const rows = result.rows ?? [];
    const output = JSON.stringify({
      success: true,
      rowCount: rows.length,
      columns: result.fields?.map((f) => f.name) ?? [],
      rows: rows.slice(0, 200),
      truncated: rows.length > 200,
    });

    // Truncate if too large
    if (output.length > 20000) {
      return JSON.stringify({
        success: true,
        rowCount: rows.length,
        columns: result.fields?.map((f) => f.name) ?? [],
        rows: rows.slice(0, 50),
        truncated: true,
        note: "Output too large, showing first 50 rows.",
      });
    }

    return output;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    return JSON.stringify({
      error: `SQL query failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    client.release();
  }
}

async function editFile(
  fileId: string,
  operation: string,
  search: string | undefined,
  replacement: string,
  replaceAll: boolean | undefined,
  executionId: number,
): Promise<string> {
  try {
    // Read the original file
    const readResult = await readFile(fileId);
    const parsed = JSON.parse(readResult);
    if (!parsed.success || !parsed.content) {
      return JSON.stringify({
        error: parsed.error || "File is binary or not readable as text. Use executeCode for binary file editing.",
      });
    }

    let content = parsed.content as string;
    const filename = (parsed.filename as string) || "edited-file.txt";
    let changeCount = 0;

    switch (operation) {
      case "replace": {
        if (!search) return JSON.stringify({ error: "search is required for replace operation" });
        if (replaceAll) {
          const parts = content.split(search);
          changeCount = parts.length - 1;
          content = parts.join(replacement);
        } else {
          const idx = content.indexOf(search);
          if (idx >= 0) {
            content = content.slice(0, idx) + replacement + content.slice(idx + search.length);
            changeCount = 1;
          }
        }
        if (changeCount === 0) {
          return JSON.stringify({ error: `Search text not found in file: "${search.slice(0, 100)}"` });
        }
        break;
      }
      case "append":
        content = content + replacement;
        changeCount = 1;
        break;
      case "prepend":
        content = replacement + content;
        changeCount = 1;
        break;
      case "insertAfter": {
        if (!search) return JSON.stringify({ error: "search is required for insertAfter operation" });
        const lines = content.split("\n");
        const idx = lines.findIndex((l) => l.includes(search));
        if (idx < 0) {
          return JSON.stringify({ error: `Line not found: "${search.slice(0, 100)}"` });
        }
        lines.splice(idx + 1, 0, replacement);
        content = lines.join("\n");
        changeCount = 1;
        break;
      }
      default:
        return JSON.stringify({ error: `Unknown operation: ${operation}` });
    }

    // Save as new file via createFile
    const saveResult = await createFile(filename, content, parsed.mediaType || undefined, executionId);
    const saveData = JSON.parse(saveResult);

    return JSON.stringify({
      success: true,
      operation,
      changes: changeCount,
      newFileId: saveData.fileId,
      filename: saveData.filename,
      size: saveData.size,
      url: saveData.url,
    });
  } catch (err) {
    return JSON.stringify({
      error: `editFile failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function listFiles(
  executionId: number,
  includeAllRecent: boolean,
): Promise<string> {
  try {
    const url = includeAllRecent
      ? `${RAG_UI_URL}/api/task-files?recent=50`
      : `${RAG_UI_URL}/api/task-files?executionId=${executionId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return JSON.stringify({ error: `Failed to list files: ${res.status}` });
    }
    const data = await res.json();
    return JSON.stringify({
      success: true,
      files: data.files ?? data,
    });
  } catch (err) {
    return JSON.stringify({
      error: `listFiles failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function grepFiles(
  pattern: string,
  executionId: number,
  fileId?: string,
): Promise<string> {
  try {
    let re: RegExp;
    try {
      re = new RegExp(pattern, "gi");
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    }

    // If searching a single file
    if (fileId) {
      const content = await readFile(fileId);
      const parsed = JSON.parse(content);
      if (!parsed.success || !parsed.content) {
        return JSON.stringify({ error: parsed.error || "File not readable as text" });
      }
      const matches = findMatches(parsed.content, re, parsed.filename || fileId);
      return JSON.stringify({ success: true, matches, totalFiles: 1 });
    }

    // List files from execution
    const listResult = JSON.parse(await listFiles(executionId, false));
    if (!listResult.success) {
      return JSON.stringify({ error: listResult.error || "Failed to list files" });
    }

    const files = listResult.files as Array<{ file_id?: string; fileId?: string; filename: string; media_type?: string; mediaType?: string }>;
    const textFiles = files.filter((f) => {
      const mt = f.media_type || f.mediaType || "";
      return mt.startsWith("text/") || mt.includes("json") || mt.includes("csv") || mt.includes("xml") || mt.includes("markdown");
    });

    const allMatches: Array<{ filename: string; fileId: string; line: number; text: string }> = [];
    for (const f of textFiles.slice(0, 20)) {
      const fid = f.file_id || f.fileId || "";
      const content = await readFile(fid);
      const parsed = JSON.parse(content);
      if (parsed.success && parsed.content) {
        const m = findMatches(parsed.content, re, f.filename);
        for (const match of m) {
          allMatches.push({ ...match, fileId: fid });
        }
      }
    }

    return JSON.stringify({
      success: true,
      matches: allMatches.slice(0, 100),
      totalFiles: textFiles.length,
      filesSearched: Math.min(textFiles.length, 20),
    });
  } catch (err) {
    return JSON.stringify({
      error: `grepFiles failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function findMatches(
  content: string,
  re: RegExp,
  filename: string,
): Array<{ filename: string; line: number; text: string }> {
  const lines = content.split("\n");
  const matches: Array<{ filename: string; line: number; text: string }> = [];
  for (let i = 0; i < lines.length && matches.length < 50; i++) {
    if (re.test(lines[i])) {
      // Include 1 line of context before/after
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 1);
      const context = lines.slice(start, end + 1).join("\n");
      matches.push({ filename, line: i + 1, text: context.slice(0, 500) });
    }
    re.lastIndex = 0; // reset for global regex
  }
  return matches;
}
