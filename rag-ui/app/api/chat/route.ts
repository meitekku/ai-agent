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
import { searchOnly, getKB, type SearchResult } from "@/lib/rag-client";
import { getCachedResponse, cacheResponse } from "@/lib/semantic-cache";
import { TAVILY_API_KEY } from "@/lib/constants";
import { getEnabledSkills } from "@/lib/skills-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const hasTavily = !!TAVILY_API_KEY;
const hasGoogleSearch = !hasTavily && !!geminiGoogleSearch;

function buildSystemPrompt(hasKb: boolean): string {
  const webSearchToolName = hasTavily ? "webSearch" : "google_search";
  const hasWeb = hasTavily || hasGoogleSearch;

  let prompt = `あなたはナレッジベースを活用する AI アシスタントです。ユーザーの質問に対し、内部ドキュメントとウェブの情報を組み合わせて正確に回答します。

## 回答ルール
- ユーザーの質問と同じ言語で回答。デフォルトは日本語
- 検索結果の情報を漏れなく活用し、包括的で詳細な回答を作成。具体的なデータ、人名、研究結果、事例を積極的に引用
- 簡単な質問には簡潔に（1〜3文）、複雑な質問には見出し（##）や箇条書きで構造化して詳細に回答
- コードブロックには言語タグを付ける（\`\`\`python, \`\`\`sql 等）
- 表形式のデータは Markdown テーブルで表示`;

  // ツール判断フレームワーク
  prompt += `

## ツール使用判断（優先順位順）`;

  if (hasKb) {
    prompt += `
1. **直接回答**（ツール不要）: 挨拶、雑談、一般知識、プログラミングなど KB に無関係な質問
2. **searchKnowledgeBase**: KB のトピックに関連する可能性がある質問。迷ったら検索する — 不要な検索のコストは低く、検索漏れのコストは高い
3. **readUrl**: ユーザーが URL を提示した場合、または検索結果で詳細が必要なページがある場合`;
    if (hasWeb) {
      prompt += `
4. **${webSearchToolName}**: KB の検索結果が不十分な場合、最新情報・時事・リアルタイム情報が必要な場合、ユーザーが「検索して」「最新の」等と指示した場合

ツールの組み合わせ可: KB 検索 → 不十分 → ウェブ検索 → 重要ページを readUrl で深掘り`;
    }
  } else {
    prompt += `
- ナレッジベースは未選択。ユーザーの質問に直接回答
- **readUrl**: ユーザーが URL を提示した場合に使用`;
    if (hasWeb) {
      prompt += `
- **${webSearchToolName}**: 最新情報やウェブ上の情報が必要な場合、ユーザーが「検索して」「最新の」等と指示した場合`;
    }
  }

  // 情報の信頼度ヒエラルキー
  if (hasKb) {
    prompt += `

## 情報の優先順位
1. **KB の検索結果** — 最も信頼性が高い。具体的なデータ・引用を優先使用
2. ${hasWeb ? `**ウェブ検索結果** — 最新情報や KB にない情報の補完。出典 URL を必ず記載
3. ` : ""}**自身の知識** — KB${hasWeb ? "・ウェブ" : ""}の情報がない場合のみ使用。KB の情報と混同しない

KB の情報とウェブの情報が矛盾する場合は、両方の情報を提示しユーザーに判断を委ねてください。`;
  }

  // 出典ルール
  prompt += `

## 出典の記載
- KB 出典: 段落末尾に「（出典: ドキュメント名, p.X）」形式。複数は「（出典: Doc A, p.3; Doc B, p.7）」
- ウェブ出典: [タイトル](URL) 形式のインラインリンク
- 自身の知識: 出典タグ不要
- 検索結果にない情報を「ドキュメントによると」と偽って引用しないこと。出典が不明な場合は推測・捏造せず省略する`;

  // 検索クエリの最適化
  if (hasKb && hasTavily) {
    prompt += `

## 検索クエリのコツ
- searchKnowledgeBase: ユーザーの質問をそのまま使用（意味検索なので自然言語が最適）
- webSearch: 簡潔なキーワード形式に変換（1〜6語）。トピックに最適な言語で検索（例: 「2024年の日本のGDP成長率は？」→ "Japan GDP growth 2024"）`;
  }

  return prompt;
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  let service: "lightrag" | "pageindex";
  let skipCache = false;
  let kb: string | null = null;
  try {
    const body = await req.json();
    messages = body.messages;
    service = body.service === "pageindex" ? "pageindex" : "lightrag";
    skipCache = !!body.skipCache;
    kb = body.kb ?? null;
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
  if (queryText && !skipCache && kb) {
    const cached = await getCachedResponse(queryText, kb);
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

  // Build tools map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // Only inject searchKnowledgeBase when a KB is selected
  if (kb) {
    let kbDescription =
      "内部ナレッジベースから関連情報を検索します。ユーザーの質問がナレッジベースに関連する可能性がある場合に使用してください。";
    try {
      const kbInfo = await getKB(kb);
      if (kbInfo?.title) {
        kbDescription = `ナレッジベース「${kbInfo.title}」を検索: ${kbInfo.description}。ユーザーの質問がこのトピックに関連する可能性がある場合に使用。`;
      }
    } catch (e) {
      console.error("[chat] kb fetch failed:", e);
    }

    tools.searchKnowledgeBase = tool({
      description: kbDescription,
      inputSchema: z.object({
        query: z.string().describe("Search query for the knowledge base"),
      }),
      execute: async ({ query }) => {
        console.log(`[chat] 🔍 searchKnowledgeBase: "${query}" kb=${kb}`);
        const t0 = Date.now();
        try {
          const searchRes = await searchOnly(query, { topK: 8, service, kb });
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
    });
  }

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

    let systemPrompt = buildSystemPrompt(!!kb);

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
        if (queryText && text && usedKB && kb) {
          cacheResponse(queryText, text, [], kb).catch(() => {});
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
