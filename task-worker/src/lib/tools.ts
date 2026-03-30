import { tool } from "ai";
import { z } from "zod";
import { Resend } from "resend";
import { executeCode } from "./sandbox";
import { AiEmail } from "./emails/ai-email";

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://lightrag:8007";
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || "http://crm-service:8009";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const RAG_UI_URL = process.env.RAG_UI_URL || "http://rag-ui:3000";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "FG ZhaoWenguang <noreply@wgzhao.me>";

// ============================================================
// Tool definitions (AI SDK + Zod, using inputSchema)
// ============================================================

export function buildTools(executionId: number) {
  return {
    searchKnowledgeBase: tool({
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
    }),

    webSearch: tool({
      description:
        "Search the web for current, real-time information. Returns top results with snippets and URLs. Use when: the task needs up-to-date information (news, stock prices, weather, recent events) or public knowledge not in the knowledge base. Do not use when: the information is likely in the internal knowledge base — use searchKnowledgeBase first. Prefer this over readUrl when you don't have a specific URL yet.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => webSearch(query),
    }),

    readUrl: tool({
      description:
        "Fetch and extract the text content of a specific web page. Use when: you already have a URL (from webSearch results, user input, or a known source) and need its full content. Do not use when: you need to discover pages — use webSearch first to find relevant URLs, then readUrl to get details.",
      inputSchema: z.object({
        url: z.string().describe("The URL to read"),
      }),
      execute: async ({ url }) => readUrl(url),
    }),

    crmApi: tool({
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
    }),

    executeCode: tool({
      description:
        "Execute code in an isolated sandbox container with a full bash environment. IMPORTANT: Any files saved to /output/ will be automatically uploaded and made available for download by the user. Use this for binary files (videos, images, PDFs, archives, etc.) that cannot be passed as text. Prefer language='bash' for CLI-centric tasks (piping, file manipulation, media processing). CLI tools: ffmpeg (video/audio), imagemagick/convert (image processing), graphviz/dot (graph diagrams), gnuplot (plots), pandoc (document conversion: md→docx/pdf/html), weasyprint (HTML→PDF), curl, wget, httpie (HTTP), jq (JSON), xmlstarlet (XML), csvkit/csvlook/csvsql (CSV querying), miller/mlr (CSV/JSON transform), ripgrep/rg (fast search), sqlite3 (SQL), yt-dlp (video download), gallery-dl (image download), git, zip, bc, tree. Python packages: numpy, scipy, pandas, matplotlib, seaborn, plotly (interactive charts), scikit-learn (ML), openpyxl, xlsxwriter, requests, beautifulsoup4, lxml, feedparser (RSS), yfinance (stock data), tabulate, Pillow, pydantic, python-docx (Word), reportlab (PDF), sympy (math). Use when: the task requires computation, data processing, file conversion, media processing, web scraping, ML, chart generation, or any logic too complex for the LLM alone. Do not use when: the answer can be derived from reasoning alone without running code.",
      inputSchema: z.object({
        language: z
          .string()
          .describe("Language: 'bash' for shell commands & CLI tools, 'python' for data/ML/scripting, 'javascript' for Node.js, 'typescript' for Node.js with native TS support"),
        code: z.string().describe("The code to execute"),
      }),
      execute: async ({ language, code }) => runCode(language, code, executionId),
    }),

    createFile: tool({
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
    }),

    sendEmail: tool({
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
      execute: async ({ to, subject, body }) =>
        sendEmail(to, subject, body),
    }),
  };
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
    .map((r: any) => `${r.title}\n${r.url}\n${r.content}`)
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
      const text = await res.text();
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
  if (!res.ok)
    return JSON.stringify({ error: `CRM API failed: ${res.status}` });
  const data = await res.json();
  return JSON.stringify(data).slice(0, 8000);
}

async function runCode(language: string, code: string, executionId: number): Promise<string> {
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

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    xml: "application/xml",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return map[ext || ""] || "application/octet-stream";
}
