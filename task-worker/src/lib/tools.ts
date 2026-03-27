import { tool } from "ai";
import { z } from "zod";
import { executeCode } from "./sandbox";

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://lightrag:8007";
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || "http://crm-service:8009";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const RAG_UI_URL = process.env.RAG_UI_URL || "http://rag-ui:3000";

// ============================================================
// Tool definitions (AI SDK + Zod, using inputSchema)
// ============================================================

export function buildTools(executionId: number) {
  return {
    searchKnowledgeBase: tool({
      description:
        "Search the knowledge base for relevant information. Returns excerpts from indexed documents.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        kb: z.string().optional().describe("Knowledge base slug"),
      }),
      execute: async ({ query, kb }) => searchKnowledgeBase(query, kb),
    }),

    webSearch: tool({
      description: "Search the web for current information on a topic.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => webSearch(query),
    }),

    readUrl: tool({
      description: "Read the content of a web page.",
      inputSchema: z.object({
        url: z.string().describe("The URL to read"),
      }),
      execute: async ({ url }) => readUrl(url),
    }),

    crmApi: tool({
      description:
        "Call the CRM service API to fetch or analyze deal data.",
      inputSchema: z.object({
        endpoint: z
          .string()
          .describe("CRM endpoint path, e.g. /sf/list, /deals/analyze"),
        body: z
          .string()
          .optional()
          .describe("JSON body for the POST request"),
      }),
      execute: async ({ endpoint, body }) => crmApi(endpoint, body),
    }),

    executeCode: tool({
      description:
        "Execute code in a secure sandbox. Supports Python and JavaScript. Python has pandas, matplotlib, openpyxl, Pillow, requests, beautifulsoup4 pre-installed.",
      inputSchema: z.object({
        language: z
          .string()
          .describe("Programming language: python or javascript"),
        code: z.string().describe("The code to execute"),
      }),
      execute: async ({ language, code }) => runCode(language, code),
    }),

    createFile: tool({
      description:
        "Save a file artifact that the user can download. Use for reports, CSV data, JSON exports, etc. You can call this multiple times to create multiple files.",
      inputSchema: z.object({
        filename: z
          .string()
          .describe("File name with extension, e.g. report.csv, summary.json"),
        content: z.string().describe("File content as text"),
        mediaType: z
          .string()
          .optional()
          .describe("MIME type, e.g. text/csv, application/json, text/plain"),
      }),
      execute: async ({ filename, content, mediaType }) =>
        createFile(filename, content, mediaType, executionId),
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

async function runCode(language: string, code: string): Promise<string> {
  try {
    const result = await executeCode(language, code);
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
    const base64Content = Buffer.from(content, "utf-8").toString("base64");

    const res = await fetch(`${RAG_UI_URL}/api/task-files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: base64Content,
        filename,
        mediaType: mediaType || guessMimeType(filename),
        executionId,
      }),
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
