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
import { getEnabledSkills } from "@/lib/skills-db";

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
            "Search the web and get a list of results with summaries. Use when the knowledge base results are insufficient or the user requests web search. Follow up with readPage to get full content of specific results.",
          inputSchema: z.object({
            query: z.string().describe("Optimized search query (use the best language for the topic)"),
            topic: z
              .enum(["general", "news", "finance"])
              .optional()
              .describe("'news' for recent events, 'finance' for financial data, 'general' for everything else"),
            timeRange: z
              .enum(["day", "week", "month", "year"])
              .optional()
              .describe("Filter results by recency, only set when freshness matters"),
          }),
          execute: async ({ query, topic, timeRange }) => {
            console.log(`[chat] 🌐 webSearch: "${query}" topic=${topic ?? "general"} time=${timeRange ?? "any"}`);
            const t0 = Date.now();

            const doSearch = async (depth: "basic" | "advanced", minScore: number) => {
              const body: Record<string, unknown> = {
                query,
                max_results: 5,
                search_depth: depth,
                topic: topic ?? "general",
                include_answer: true,
              };
              if (timeRange) body.time_range = timeRange;
              const res = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${TAVILY_API_KEY}`,
                },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                const msg = await res.text().catch(() => "");
                console.error(`[chat] ❌ webSearch failed: ${res.status} ${msg}`);
                throw new Error(`Web search failed: ${res.status}`);
              }
              const data = await res.json();
              const results =
                data.results
                  ?.filter((r: { score: number }) => r.score >= minScore)
                  .map(
                    (r: { title: string; url: string; content: string; score: number }) => ({
                      title: r.title,
                      url: r.url,
                      summary: r.content,
                      relevance: r.score,
                    }),
                  ) ?? [];
              return { answer: data.answer as string | null, results, totalCount: data.results?.length ?? 0 };
            };

            // First attempt: basic search, score ≥ 0.4
            let { answer, results, totalCount } = await doSearch("basic", 0.4);
            console.log(
              `[chat] 🌐 webSearch[1/2]: ${Date.now() - t0}ms, ${totalCount} total → ${results.length} relevant (≥0.4)`,
            );

            // Retry with advanced search if no relevant results
            if (results.length === 0) {
              console.log(`[chat] 🌐 webSearch retry: no relevant results, trying advanced search...`);
              ({ answer, results, totalCount } = await doSearch("advanced", 0.2));
              console.log(
                `[chat] 🌐 webSearch[2/2]: ${Date.now() - t0}ms, ${totalCount} total → ${results.length} relevant (≥0.2)`,
              );
            }

            return { answer, results };
          },
        }),

        readPage: tool({
          description:
            "Extract full content from specific URLs. Use after webSearch to read pages that look most relevant from the search results. Can read up to 3 URLs at once.",
          inputSchema: z.object({
            urls: z
              .array(z.string())
              .describe("URLs to extract content from (max 3)"),
            query: z
              .string()
              .optional()
              .describe("The original question, used to rank content chunks by relevance"),
          }),
          execute: async ({ urls, query }) => {
            const targetUrls = urls.slice(0, 3);
            console.log(`[chat] 📄 readPage: ${targetUrls.length} URLs`);
            const t0 = Date.now();
            const res = await fetch("https://api.tavily.com/extract", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${TAVILY_API_KEY}`,
              },
              body: JSON.stringify({
                urls: targetUrls,
                query: query ?? undefined,
                format: "markdown",
                chunks_per_source: 3,
              }),
            });
            if (!res.ok) {
              const msg = await res.text().catch(() => "");
              console.error(`[chat] ❌ readPage failed: ${res.status} ${msg}`);
              throw new Error(`Page extraction failed: ${res.status}`);
            }
            const data = await res.json();
            console.log(
              `[chat] 📄 readPage done: ${Date.now() - t0}ms, ${data.results?.length ?? 0} succeeded, ${data.failed_results?.length ?? 0} failed`,
            );
            return {
              pages:
                data.results?.map(
                  (r: { url: string; raw_content: string }) => ({
                    url: r.url,
                    content: r.raw_content?.slice(0, 5000) ?? "",
                  }),
                ) ?? [],
              failed:
                data.failed_results?.map(
                  (r: { url: string; error: string }) => ({
                    url: r.url,
                    error: r.error,
                  }),
                ) ?? [],
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

    // Inject enabled skills into system prompt (non-fatal)
    try {
      const skills = await getEnabledSkills();
      if (skills.length > 0) {
        systemPrompt += "\n\n## スキル（追加指示）";
        for (const skill of skills) {
          systemPrompt += `\n\n### ${skill.name}\n${skill.content}`;
        }
      }
    } catch (e) {
      console.error("[chat] skills injection failed:", e);
    }

    const chatModel = getChatModel();

    const result = streamText({
      model: chatModel,
      system: useGemini ? systemPrompt : systemPrompt + "\n\n/no_think",
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: hasTavily ? stepCountIs(4) : undefined,
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
