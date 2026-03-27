import { executeCode } from "./sandbox";

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://lightrag:8007";
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || "http://crm-service:8009";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

// ============================================================
// Tool definitions (Gemini function declarations)
// ============================================================

export const TOOL_DECLARATIONS = [
  {
    name: "searchKnowledgeBase",
    description:
      "Search the knowledge base for relevant information. Returns excerpts from indexed documents.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        query: { type: "STRING" as const, description: "The search query" },
        kb: {
          type: "STRING" as const,
          description: "Knowledge base slug (optional)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "webSearch",
    description: "Search the web for current information on a topic.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        query: { type: "STRING" as const, description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "readUrl",
    description: "Read the content of a web page.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        url: { type: "STRING" as const, description: "The URL to read" },
      },
      required: ["url"],
    },
  },
  {
    name: "crmApi",
    description:
      "Call the CRM service API to fetch or analyze deal data.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        endpoint: {
          type: "STRING" as const,
          description: "CRM endpoint path, e.g. /sf/list, /deals/analyze",
        },
        body: {
          type: "STRING" as const,
          description: "JSON body for the POST request",
        },
      },
      required: ["endpoint"],
    },
  },
  {
    name: "executeCode",
    description:
      "Execute code in a secure sandbox. Supports Python and JavaScript.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        language: {
          type: "STRING" as const,
          description: "Programming language: python or javascript",
        },
        code: { type: "STRING" as const, description: "The code to execute" },
      },
      required: ["language", "code"],
    },
  },
];

// ============================================================
// Tool execution
// ============================================================

export async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  switch (name) {
    case "searchKnowledgeBase":
      return await searchKnowledgeBase(args.query, args.kb);
    case "webSearch":
      return await webSearch(args.query);
    case "readUrl":
      return await readUrl(args.url);
    case "crmApi":
      return await crmApi(args.endpoint, args.body);
    case "executeCode":
      return await runCode(args.language, args.code);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

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
  if (!res.ok) return JSON.stringify({ error: `KB search failed: ${res.status}` });
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
  if (!res.ok) return JSON.stringify({ error: `Web search failed: ${res.status}` });
  const data = await res.json();
  const results = (data.results || [])
    .map((r: any) => `${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n");
  return (data.answer ? `Answer: ${data.answer}\n\n` : "") + results.slice(0, 6000);
}

async function readUrl(url: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    // Fallback: simple fetch
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
  if (!res.ok) return JSON.stringify({ error: `URL read failed: ${res.status}` });
  const data = await res.json();
  const content = data.results?.[0]?.raw_content || data.results?.[0]?.text || "";
  return content.slice(0, 8000);
}

async function crmApi(endpoint: string, body?: string): Promise<string> {
  const url = `${CRM_SERVICE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
  if (!res.ok) return JSON.stringify({ error: `CRM API failed: ${res.status}` });
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
