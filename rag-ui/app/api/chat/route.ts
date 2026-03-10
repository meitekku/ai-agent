import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
  ToolLoopAgent,
  UIMessage,
} from "ai";
import { z } from "zod";
import {
  getChatModel,
  useGemini,
  backendName,
  geminiGoogleSearch,
} from "@/lib/ollama-provider";
import { searchOnly, type SearchResult } from "@/lib/rag-client";
import { getCachedResponse, cacheResponse } from "@/lib/semantic-cache";
import { TAVILY_API_KEY } from "@/lib/constants";
import { getEnabledSkills } from "@/lib/skills-db";
import { getKbConfig } from "@/lib/kb-config-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const hasTavily = !!TAVILY_API_KEY;
const hasGoogleSearch = !hasTavily && !!geminiGoogleSearch;

function buildSystemPrompt(): string {
  let prompt = `あなたはナレッジベースを活用する AI アシスタントです。ユーザーの質問に対し、内部ドキュメントとウェブの情報を組み合わせて正確に回答します。

## 回答ガイドライン
- 回答言語: ユーザーの質問と同じ言語で回答してください。デフォルトは日本語です。
- 回答の充実度: 検索結果に含まれる情報を**漏れなく**活用し、ユーザーの質問に対して包括的で詳細な回答を作成してください。検索結果に複数のドキュメントや視点がある場合は、それぞれの情報を統合して回答してください。短い要約ではなく、具体的なデータ、人名、研究結果、事例などを積極的に引用してください。
- 回答の構造: 見出し（##）や箇条書きを活用して、読みやすく構造化してください。
- 出典の記載: 回答中の各段落やセクションの末尾に、参照したドキュメント名とページを記載してください。形式:「（出典: ドキュメント名, Page X）」。

## ツール使用
- ナレッジベースのトピックに関連する質問には searchKnowledgeBase を使用してください。
- ユーザーが URL を提示した場合や、ウェブ検索結果の中で特に重要そうなページがある場合は readUrl を使用して詳細な内容を取得してください。
- 挨拶や雑談など明らかに関係ない場合は直接回答してください。`;

  const webSearchToolName = hasTavily ? "webSearch" : "google_search";
  if (hasTavily || hasGoogleSearch) {
    prompt += `

## ウェブ検索
${webSearchToolName} ツールが利用可能です。以下の場合に使用してください：
- ナレッジベースの検索結果が質問に対して不十分な場合
- 最新のニュース、時事問題、リアルタイム情報が必要な場合
- ユーザーが「検索して」「調べて」「最新の」などウェブ検索を意図している場合
ナレッジベースに十分な情報がある場合はそのまま回答してください。ウェブ検索結果を使用した場合は出典URLを含めてください。`;
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
    return Response.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const t = { start: Date.now(), cache: 0, prompt: 0, stream: 0 };

  // Extract last user message text for cache key
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
      console.log(
        `[chat] ⚡ cache hit (${t.cache}ms):`,
        queryText.slice(0, 50),
      );
      const partId = crypto.randomUUID();
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          async execute({ writer }) {
            writer.write({ type: "text-start", id: partId });
            writer.write({
              type: "text-delta",
              id: partId,
              delta: cached.response,
            });
            writer.write({ type: "text-end", id: partId });
          },
        }),
      });
    }
  }

  // Build KB tool description dynamically
  let kbDescription =
    "内部ナレッジベースから関連情報を検索します。ユーザーの質問がナレッジベースに関連する可能性がある場合に使用してください。";
  try {
    const kbConfig = await getKbConfig();
    if (kbConfig?.title) {
      kbDescription = `ナレッジベース「${kbConfig.title}」を検索: ${kbConfig.description}。ユーザーの質問がこのトピックに関連する可能性がある場合に使用。`;
    }
  } catch (e) {
    console.error("[chat] kb-config fetch failed:", e);
  }

  // Build tools map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    searchKnowledgeBase: tool({
      description: kbDescription,
      inputSchema: z.object({
        query: z.string().describe("Search query for the knowledge base"),
      }),
      execute: async ({ query }) => {
        console.log(`[chat] 🔍 searchKnowledgeBase: "${query}"`);
        const t0 = Date.now();
        try {
          const searchRes = await searchOnly(query, { topK: 8, service });
          const elapsed = Date.now() - t0;
          console.log(
            `[chat] 🔍 search: ${elapsed}ms →`,
            searchRes.results?.length ?? 0,
            "results",
          );

          if (!searchRes.results || searchRes.results.length === 0) {
            return {
              found: false,
              message: "関連するドキュメントは見つかりませんでした。",
            };
          }

          const contexts = searchRes.results.map(
            (r: SearchResult, i: number) => ({
              index: i + 1,
              document: r.name ?? "unknown",
              content: r.content ?? r.tree_context?.context ?? "",
            }),
          );

          return {
            found: true,
            results: contexts,
            knowledge_graph: searchRes.knowledge_graph ?? "",
            source_documents: searchRes.source_documents ?? [],
          };
        } catch (err) {
          console.error(`[chat] search failed (${Date.now() - t0}ms):`, err);
          return {
            found: false,
            message: "ナレッジベース検索に失敗しました。",
          };
        }
      },
    }),
  };

  // readUrl: fetch any URL and extract text content (always available)
  tools.readUrl = tool({
    description:
      "Fetch a web page by URL and extract its text content. Use when: (1) the user provides a specific URL, (2) a web search result looks highly relevant and you need the full content beyond the summary, (3) you need to verify or get details from a specific source.",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to fetch"),
    }),
    execute: async ({ url }) => {
      console.log(`[chat] 🔗 readUrl: ${url}`);
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RAGBot/1.0)",
            Accept: "text/html,application/xhtml+xml,text/plain,*/*",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          return { success: false, error: `HTTP ${res.status}` };
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (
          !contentType.includes("text/") &&
          !contentType.includes("application/json") &&
          !contentType.includes("application/xml")
        ) {
          return {
            success: false,
            error: `Unsupported content type: ${contentType}`,
          };
        }
        const html = await res.text();
        // Strip HTML tags, scripts, styles to get plain text
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[\s\S]*?<\/nav>/gi, "")
          .replace(/<header[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[\s\S]*?<\/footer>/gi, "")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const truncated = text.slice(0, 8000);
        console.log(
          `[chat] 🔗 readUrl done: ${Date.now() - t0}ms, ${truncated.length} chars`,
        );
        return { success: true, url, content: truncated };
      } catch (err) {
        console.error(`[chat] ❌ readUrl failed: ${err}`);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  if (hasTavily) {
    tools.webSearch = tool({
      description:
        "Search the web and get a list of results with summaries. Use when the knowledge base results are insufficient or the user requests web search. Follow up with readPage to get full content of specific results.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Optimized search query (use the best language for the topic)",
          ),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .describe(
            "'news' for recent events, 'finance' for financial data, 'general' for everything else",
          ),
        timeRange: z
          .enum(["day", "week", "month", "year"])
          .optional()
          .describe(
            "Filter results by recency, only set when freshness matters",
          ),
      }),
      execute: async ({ query, topic, timeRange }) => {
        console.log(
          `[chat] 🌐 webSearch: "${query}" topic=${topic ?? "general"} time=${timeRange ?? "any"}`,
        );
        const t0 = Date.now();

        const doSearch = async (
          depth: "basic" | "advanced",
          minScore: number,
        ) => {
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
                (r: {
                  title: string;
                  url: string;
                  content: string;
                  score: number;
                }) => ({
                  title: r.title,
                  url: r.url,
                  summary: r.content,
                  relevance: r.score,
                }),
              ) ?? [];
          return {
            answer: data.answer as string | null,
            results,
            totalCount: data.results?.length ?? 0,
          };
        };

        // First attempt: basic search, score ≥ 0.4
        let { answer, results, totalCount } = await doSearch("basic", 0.4);
        console.log(
          `[chat] 🌐 webSearch[1/2]: ${Date.now() - t0}ms, ${totalCount} total → ${results.length} relevant (≥0.4)`,
        );

        // Retry with advanced search if no relevant results
        if (results.length === 0) {
          console.log(
            `[chat] 🌐 webSearch retry: no relevant results, trying advanced search...`,
          );
          ({ answer, results, totalCount } = await doSearch("advanced", 0.2));
          console.log(
            `[chat] 🌐 webSearch[2/2]: ${Date.now() - t0}ms, ${totalCount} total → ${results.length} relevant (≥0.2)`,
          );
        }

        return { answer, results };
      },
    });

    tools.readPage = tool({
      description:
        "Extract full content from specific URLs. Use after webSearch to read pages that look most relevant from the search results. Can read up to 3 URLs at once.",
      inputSchema: z.object({
        urls: z
          .array(z.string())
          .describe("URLs to extract content from (max 3)"),
        query: z
          .string()
          .optional()
          .describe(
            "The original question, used to rank content chunks by relevance",
          ),
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
            data.results?.map((r: { url: string; raw_content: string }) => ({
              url: r.url,
              content: r.raw_content?.slice(0, 5000) ?? "",
            })) ?? [],
          failed:
            data.failed_results?.map((r: { url: string; error: string }) => ({
              url: r.url,
              error: r.error,
            })) ?? [],
        };
      },
    });
  } else if (hasGoogleSearch) {
    // Gemini built-in Google Search grounding as fallback
    tools.google_search = geminiGoogleSearch;
    console.log(
      "[chat] 🌐 Using Gemini Google Search grounding (Tavily not configured)",
    );
  }

  try {
    const t1 = Date.now();
    t.prompt = t1 - t.start;
    let firstTokenTime = 0;

    let systemPrompt = buildSystemPrompt();

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

    const agent = new ToolLoopAgent({
      model: chatModel,
      instructions: useGemini ? systemPrompt : systemPrompt + "\n\n/no_think",
      tools,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 8192,
    });

    const result = await agent.stream({
      messages: await convertToModelMessages(messages),
      experimental_onStepStart() {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - t1;
          console.log(`[chat] 🚀 TTFT (${backendName} prefill): ${ttft}ms`);
        }
      },
      async onFinish({ text, usage, steps }) {
        t.stream = Date.now() - t.start;
        console.log(
          `[chat] ✅ done: total=${t.stream}ms | cache=${t.cache}ms prefill=${firstTokenTime ? firstTokenTime - t1 : "?"}ms gen=${firstTokenTime ? Date.now() - firstTokenTime : "?"}ms | tokens=${(usage as Record<string, unknown>)?.completionTokens ?? usage?.outputTokens ?? "?"}`,
        );
        // Only cache responses that used the knowledge base
        const usedKB = steps?.some((step) =>
          step.toolCalls?.some((tc) => tc.toolName === "searchKnowledgeBase"),
        );
        if (queryText && text && usedKB) {
          cacheResponse(queryText, text, []).catch(() => {});
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[chat] streaming failed:", err);
    return Response.json(
      { error: "Chat service unavailable" },
      { status: 502 },
    );
  }
}
