import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from "ai";
import { z } from "zod";
import { getChatModel, useGemini, backendName } from "@/lib/ollama-provider";
import { searchOnly, type SearchResult } from "@/lib/rag-client";
import { getCachedResponse, cacheResponse } from "@/lib/semantic-cache";
import { TAVILY_API_KEY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const hasTavily = !!TAVILY_API_KEY;

const BASE_SYSTEM_PROMPT = `あなたはナレッジベースアシスタントです。ユーザーの質問に対して、提供されたドキュメントの情報に基づいて正確に回答してください。

重要なルール:
- 以下の「検索結果」セクションに含まれるドキュメント情報に基づいて回答してください
- 情報が見つからない場合は「関連する情報が見つかりませんでした」と伝えてください
- 回答にはソースのドキュメント名を含めてください
- 日本語で回答してください（ユーザーが別の言語で質問した場合はその言語で回答）`;

const WEB_SEARCH_PROMPT = `

## ウェブ検索

webSearch ツールが利用可能です。以下の場合に **自分で判断して** 使用してください：
- ナレッジベースの検索結果が質問に対して不十分・無関係な場合
- 最新のニュース、時事問題、リアルタイム情報が必要な場合
- ユーザーが「検索して」「調べて」「ネットで」「最新の」などウェブ検索を意図している場合
- 特定の製品、サービス、技術の最新情報が必要な場合

ナレッジベースに十分な情報がある場合は、webSearch を使わずそのまま回答してください。
ウェブ検索結果を使用した場合は、出典のURLを回答に含めてください。`;

function buildSystemPrompt(
  contexts: { document: string; section: string; content: string }[] | null,
  searchFailed: boolean,
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (searchFailed) {
    prompt += `\n\n## 検索結果\nナレッジベース検索に失敗しました。一般的な知識に基づいて回答してください。`;
  } else if (!contexts || contexts.length === 0) {
    prompt += `\n\n## 検索結果\n関連するドキュメントは見つかりませんでした。`;
  } else {
    prompt += `\n\n## 検索結果`;
    for (let i = 0; i < contexts.length; i++) {
      const c = contexts[i];
      prompt += `\n\n### ソース ${i + 1}: ${c.document}`;
      if (c.section) prompt += `\nセクション: ${c.section}`;
      prompt += `\n${c.content}`;
    }
  }

  return prompt;
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  let service: "lightrag" | "pageindex";
  let skipCache = false;
  try {
    const body = await req.json();
    messages = body.messages;
    service = body.service === "pageindex" ? "pageindex" : "lightrag";
    skipCache = !!body.skipCache;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages array is required" }, { status: 400 });
  }

  const t = { start: Date.now(), cache: 0, search: 0, prompt: 0, stream: 0 };

  // Extract last user message text for search query
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const queryText =
    lastUserMsg?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") || "";

  // Check semantic cache first (skip on regenerate)
  if (queryText && !skipCache) {
    const cached = await getCachedResponse(queryText);
    t.cache = Date.now() - t.start;
    if (cached.hit) {
      console.log(`[chat] ⚡ cache hit (${t.cache}ms):`, queryText.slice(0, 50));
      const partId = crypto.randomUUID();
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          async execute({ writer }) {
            writer.write({ type: "text-start", id: partId });
            writer.write({ type: "text-delta", id: partId, delta: cached.response });
            writer.write({ type: "text-end", id: partId });
          },
        }),
      });
    }
  }

  // Search knowledge base before streaming
  let contexts: { document: string; section: string; content: string }[] | null = null;
  let searchFailed = false;

  if (queryText) {
    try {
      const t0 = Date.now();
      const searchRes = await searchOnly(queryText, { topK: 3, service });
      t.search = Date.now() - t0;
      console.log(`[chat] 🔍 search: ${t.search}ms →`, searchRes.results?.length ?? 0, "results");
      if (searchRes.results && searchRes.results.length > 0) {
        contexts = searchRes.results.map((r: SearchResult) => ({
          document: r.name ?? "unknown",
          section: r.tree_context?.section_path?.join(" > ") ?? "",
          content: r.tree_context?.context ?? "",
        }));
      } else {
        contexts = [];
      }
    } catch (err) {
      t.search = Date.now() - (t.start + t.cache);
      console.error(`[chat] search failed (${t.search}ms):`, err);
      searchFailed = true;
    }
  }

  // Build tools map: always offer web search (LLM decides when to use it)
  const tools = hasTavily
    ? {
        webSearch: tool({
          description:
            "Search the web for current information. Use when the knowledge base results are insufficient, irrelevant, or when the user requests web/internet search.",
          inputSchema: z.object({
            query: z.string().describe("Optimized search query (use the best language for the topic)"),
            topic: z
              .enum(["general", "news"])
              .optional()
              .describe("Search category: 'news' for recent events, 'general' for everything else"),
            searchDepth: z
              .enum(["basic", "advanced"])
              .optional()
              .describe("'advanced' for complex/detailed queries, 'basic' for simple lookups"),
          }),
          execute: async ({ query, topic, searchDepth }) => {
            console.log(`[chat] 🌐 webSearch: "${query}" topic=${topic ?? "general"} depth=${searchDepth ?? "basic"}`);
            const t0 = Date.now();
            const res = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                api_key: TAVILY_API_KEY,
                max_results: 5,
                search_depth: searchDepth ?? "basic",
                topic: topic ?? "general",
                include_answer: true,
              }),
            });
            if (!res.ok) {
              const msg = await res.text().catch(() => "");
              console.error(`[chat] ❌ webSearch failed: ${res.status} ${msg}`);
              throw new Error(`Web search failed: ${res.status}`);
            }
            const data = await res.json();
            console.log(
              `[chat] 🌐 webSearch done: ${Date.now() - t0}ms, ${data.results?.length ?? 0} results`,
            );
            return {
              answer: data.answer ?? null,
              results:
                data.results?.map((r: { title: string; url: string; content: string }) => ({
                  title: r.title,
                  url: r.url,
                  content: r.content,
                })) ?? [],
            };
          },
        }),
      }
    : undefined;

  try {
    const t1 = Date.now();
    t.prompt = t1 - t.start;
    let firstTokenTime = 0;

    let systemPrompt = buildSystemPrompt(contexts, searchFailed);
    if (hasTavily) systemPrompt += WEB_SEARCH_PROMPT;

    const chatModel = getChatModel();

    const result = streamText({
      model: chatModel,
      system: useGemini ? systemPrompt : systemPrompt + "\n\n/no_think",
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: hasTavily ? stepCountIs(3) : undefined,
      maxOutputTokens: 2048,
      onChunk() {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - t1;
          console.log(`[chat] 🚀 TTFT (${backendName} prefill): ${ttft}ms`);
        }
      },
      async onFinish({ text, usage }) {
        t.stream = Date.now() - t.start;
        console.log(
          `[chat] ✅ done: total=${t.stream}ms | cache=${t.cache}ms search=${t.search}ms prefill=${firstTokenTime ? firstTokenTime - t1 : "?"}ms gen=${firstTokenTime ? Date.now() - firstTokenTime : "?"}ms | tokens=${(usage as Record<string, unknown>)?.completionTokens ?? usage?.outputTokens ?? "?"}`,
        );
        // Cache the response for future identical queries
        if (queryText && text) {
          cacheResponse(queryText, text, contexts ?? []).catch(() => {});
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[chat] streaming failed:", err);
    return Response.json({ error: "Chat service unavailable" }, { status: 502 });
  }
}
