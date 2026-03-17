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
import { searchOnly, getKB, listKBs, type SearchResult, type KnowledgeBase } from "@/lib/rag-client";

import { TAVILY_API_KEY, CRM_SERVICE_URL } from "@/lib/constants";
import { getEnabledSkills } from "@/lib/skills-db";
import { getChatFile } from "@/lib/chat-files-db";
import { readStoredFile } from "@/lib/file-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const hasTavily = !!TAVILY_API_KEY;
const hasGoogleSearch = !hasTavily && !!geminiGoogleSearch;
const hasCrm = !!CRM_SERVICE_URL;

/**
 * Post-process model messages to resolve file data to binary Uint8Array.
 * Handles both server file URLs (/api/files/{id}) and legacy data: URLs.
 * This avoids the provider trying to fetch() these URLs (which fails in Node.js).
 */
async function resolveServerFiles(
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
) {
  const FILE_URL_RE = /^\/api\/files\/(.+)$/;

  for (const msg of modelMessages) {
    if (msg.role !== "user" || typeof msg.content === "string") continue;

    for (const part of msg.content) {
      if (part.type !== "file") continue;

      const dataStr = typeof part.data === "string" ? part.data : null;
      if (!dataStr) continue;

      // Server file URL → read from disk
      const match = dataStr.match(FILE_URL_RE);
      if (match) {
        const fileId = match[1];
        try {
          const row = await getChatFile(fileId);
          if (!row) continue;
          const buffer = await readStoredFile(row.stored_path);
          (part as unknown as Record<string, unknown>).data = new Uint8Array(buffer);
          (part as unknown as Record<string, unknown>).mimeType = row.media_type;
        } catch (err) {
          console.error(
            `[chat] resolveServerFiles failed for ${fileId}:`,
            err,
          );
        }
        continue;
      }

      // data: URL → parse base64 to binary
      if (dataStr.startsWith("data:")) {
        try {
          const commaIdx = dataStr.indexOf(",");
          if (commaIdx === -1) continue;
          const header = dataStr.slice(0, commaIdx);
          const base64 = dataStr.slice(commaIdx + 1);
          const mimeType = header.slice(5).split(";")[0];
          const binary = Buffer.from(base64, "base64");
          (part as unknown as Record<string, unknown>).data = new Uint8Array(binary);
          (part as unknown as Record<string, unknown>).mimeType = mimeType;
        } catch (err) {
          console.error(
            "[chat] resolveServerFiles data URL parse failed:",
            err,
          );
        }
      }
    }
  }
}

function buildSystemPrompt(hasKb: boolean, clientTime?: string, autoDiscovery?: boolean): string {
  const webSearchToolName = hasTavily ? "webSearch" : "google_search";
  const hasWeb = hasTavily || hasGoogleSearch;

  let prompt = `あなたはナレッジベースを活用する AI アシスタントです。ユーザーの質問に対し、内部ドキュメントとウェブの情報を組み合わせて正確に回答します。

現在の日時: ${clientTime ?? new Date().toISOString()}

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
    if (autoDiscovery) {
      prompt += `
1. **直接回答**（ツール不要）: 挨拶、雑談、一般知識、プログラミングなどナレッジベースに無関係な質問
2. **searchKnowledgeBase**: 複数のナレッジベースが利用可能。質問に最も関連する KB を選んで検索する。迷ったら検索する — 不要な検索のコストは低く、検索漏れのコストは高い。複数の KB が関連する場合は複数回検索してよい
3. **readUrl**: ユーザーが URL を提示した場合、または検索結果で詳細が必要なページがある場合`;
    } else {
      prompt += `
1. **直接回答**（ツール不要）: 挨拶、雑談、一般知識、プログラミングなど KB に無関係な質問
2. **searchKnowledgeBase**: KB のトピックに関連する可能性がある質問。迷ったら検索する — 不要な検索のコストは低く、検索漏れのコストは高い
3. **readUrl**: ユーザーが URL を提示した場合、または検索結果で詳細が必要なページがある場合`;
    }
    if (hasWeb) {
      prompt += `
4. **${webSearchToolName}**: KB の検索結果が不十分な場合、最新情報・時事・リアルタイム情報が必要な場合、ユーザーが「検索して」「最新の」等と指示した場合

ツールを積極的に組み合わせること: KB 検索 → 不十分なら → ウェブ検索 → 重要な結果を${hasTavily ? "readPage" : "readUrl"}で全文取得 → 情報を統合して回答`;
    }
  } else {
    prompt += `
- ナレッジベースは未選択。ユーザーの質問に直接回答
- **readUrl**: ユーザーが URL を提示した場合に使用`;
    if (hasWeb) {
      prompt += `
- **${webSearchToolName}**: 最新情報やウェブ上の情報が必要な場合、ユーザーが「検索して」「最新の」等と指示した場合。検索後は重要な結果を${hasTavily ? "readPage" : "readUrl"}で全文取得してから回答する`;
    }
  }

  // ツール連鎖の原則
  prompt += `

## ツール使用の原則（重要・必ず遵守）
- **研究員のように行動する**: 1回の検索で終わらず、十分な情報が集まるまで複数ステップで調査を続ける。ユーザーの質問の本質を理解し、必要な情報を自分で判断して能動的に集める
- **必須ルール: 詳細・網羅的な質問には最低3回ツールを使う**: 「まとめて」「詳しく」「できるだけ多く」等の指示がある場合、1〜2回のツール呼び出しでは不十分。異なるキーワード・角度で複数回検索し、重要な結果は全文取得してから回答する。各ステップで「まだ調べるべき角度はないか？」と自問する
- **回答前に自問する**: 「この情報だけで正確で包括的な回答ができるか？」— できないなら追加ツールを使う。1回の検索結果だけで回答を書き始めてはいけない
- **判断をユーザーに丸投げしない**: 「検索しましょうか？」「もっと調べますか？」と聞かず、自分で判断して行動する。検索結果が不十分なら、自分でキーワードや時間範囲を変えて再検索する
- **既に得た情報を活用する**: 前のステップで取得した情報（KB の財務データ等）を踏まえて次の調査や回答を組み立てる。情報を割裂して扱わない`;

  if (hasWeb) {
    prompt += `
- **ウェブ検索は複数回行う**: 1回の検索で全情報は得られない。異なるキーワードで最低2〜3回検索する（例: 「カミクラゲ 生態」→「カミクラゲ 毒性」→「Spirocodon saltatrix habitat」）。日本語と英語の両方で検索すると情報が豊富になる
- **ウェブ検索後は必ず詳細を確認する**: ${webSearchToolName}の結果はサマリーのみ。関連性の高い結果は${hasTavily ? "readPage" : "readUrl"}で全文を取得してから回答する。サマリーだけで回答を書かない
- **検索キーワードは自分で最適化する**: ユーザーの発言をそのまま検索クエリにしない。質問の意図を理解し、効果的なキーワードを自分で組み立てる。1つのキーワードで不十分なら、別の角度から複数回検索する（例: 会社名+業績、会社名+不祥事、会社名+株価 など）`;
  }

  // generateSlides ツール説明
  prompt += `
- **generateSlides**: ユーザーがスライド/プレゼン/発表資料の作成を依頼した場合、会話で質問せず直接呼び出す。ユーザーが指定したテーマ・内容・追加要望を topic/content/instructions にまとめて渡す。
  ナレッジベースの内容を使う場合は、先に searchKnowledgeBase で検索し、結果を content に含める。`;

  // CRM ツール説明
  if (hasCrm) {
    prompt += `

## CRM・提案書ツール
- **listDeals**: CRM（Salesforce/Kintone）から商談一覧を取得。「商談」「案件」「CRM」等のキーワードで使用
- **fetchDealData**: 特定商談の詳細データを取得。分析前に必ず呼ぶ
- **analyzeDeal**: 商談を分析（受注確率、スコア、シナリオ、AI 提案根拠）。fetchDealData の結果を渡す
- **generateProposal**: 提案書 PPTX を生成。analyzeDeal の結果を渡す
- **reviseRationale**: ユーザーのフィードバックで分析根拠を修正

ワークフロー例:
1. listDeals → 商談一覧表示
2. fetchDealData → 詳細取得
3. analyzeDeal → 分析結果提示
4. ユーザー確認後 → generateProposal で提案書生成`;
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
- KB 出典: ナレッジベース名を明示して引用する（例:「XXXナレッジベースによると…」）。段落末尾に「（出典: ドキュメント名, p.X）」形式。複数は「（出典: Doc A, p.3; Doc B, p.7）」
- ウェブ出典: [タイトル](URL) 形式のインラインリンク
- 自身の知識: 出典タグ不要
- 検索結果にない情報を「ドキュメントによると」と偽って引用しないこと。出典が不明な場合は推測・捏造せず省略する`;

  // 検索クエリの最適化
  if (hasKb) {
    prompt += `

## 検索クエリのコツ
- searchKnowledgeBase: ユーザーの質問をそのまま使用（意味検索なので自然言語が最適）`;
  }
  if (hasWeb) {
    prompt += `${hasKb ? "" : "\n\n## 検索クエリのコツ"}
- ${webSearchToolName}: ユーザーの発言をそのままクエリにしない。質問の本質を分析し、最も効果的なキーワードを自分で組み立てる
  - トピックに最適な言語で検索（例: 日本企業の情報→日本語、技術情報→英語）
  - 1回で見つからなければ、角度を変えて再検索（例: 「この会社大丈夫？」→ ①「社名 業績 決算」②「社名 不祥事」③「社名 株価」のように多角的に）
  - 簡潔なキーワード形式（1〜6語）が効果的`;
  }

  return prompt;
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  let service: "lightrag" | "pageindex";
  let kb: string | null = null;
  let clientTime: string | undefined;
  let modelOverride: string | null = null;
  try {
    const body = await req.json();
    messages = body.messages;
    service = body.service === "pageindex" ? "pageindex" : "lightrag";
    kb = body.kb ?? null;
    clientTime = body.clientTime;
    modelOverride = body.model ?? null;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const t = { start: Date.now(), prompt: 0, stream: 0 };

  // Auto-discovery: when no KB is manually selected, fetch all KBs
  let kbList: KnowledgeBase[] = [];
  let autoDiscovery = false;
  if (!kb) {
    try {
      const allKbs = await listKBs();
      kbList = allKbs.filter(k => k.doc_count > 0);
      autoDiscovery = kbList.length > 0;
      if (autoDiscovery) {
        console.log(`[chat] 🔍 auto-discovery: ${kbList.length} KBs available`);
      }
    } catch (e) {
      console.error("[chat] listKBs for auto-discovery failed:", e);
    }
  }

  // Build tools map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // Inject searchKnowledgeBase: single-KB mode (manual) or auto-discovery mode
  if (kb) {
    // Single-KB mode: search only the selected KB
    let kbDescription =
      "内部ナレッジベースから関連情報を検索します。ユーザーの質問がナレッジベースに関連する可能性がある場合に使用してください。";
    let kbTitle = kb;
    let kbName = kb;
    try {
      const kbInfo = await getKB(kb);
      kbTitle = kbInfo?.title || kbInfo?.name || kb;
      kbName = kbInfo?.name || kb;
      if (kbInfo?.title && kbInfo?.description) {
        kbDescription = `ナレッジベース「${kbInfo.title}」を検索: ${kbInfo.description}。ユーザーの質問がこのトピックに関連する可能性がある場合に使用。`;
      } else {
        // title が空 → バックグラウンドで自動生成（次回以降に反映）
        const origin = req.headers.get("origin") || req.headers.get("host") || "";
        const base = origin.startsWith("http") ? origin : `http://${origin}`;
        fetch(`${base}/api/kbs/${kb}/generate`, { method: "POST" }).catch(() => {});
        console.log("[chat] KB title empty, triggered background generate");
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
            knowledge_base: kbName,
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
  } else if (autoDiscovery) {
    // Auto-discovery mode: AI chooses which KB to search
    const kbDescriptions = kbList.map(k => {
      const label = k.description
        ? `${k.name} — ${k.description}`
        : k.name;
      return `- \`${k.slug}\`: ${label}（${k.doc_count}件）`;
    }).join('\n');

    const slugs = kbList.map(k => k.slug);

    tools.searchKnowledgeBase = tool({
      description: `利用可能なナレッジベースから関連情報を検索します。質問に最も関連する KB を選んでください。\n\n利用可能な KB:\n${kbDescriptions}`,
      inputSchema: z.object({
        query: z.string().describe("Search query for the knowledge base"),
        kb: z.enum([slugs[0], ...slugs.slice(1)] as [string, ...string[]]).describe("検索するナレッジベースの slug"),
      }),
      execute: async ({ query, kb: selectedKb }) => {
        const kbInfo = kbList.find(k => k.slug === selectedKb);
        const kbName = kbInfo?.name || selectedKb;
        console.log(`[chat] 🔍 searchKnowledgeBase: "${query}" kb=${selectedKb} (auto-discovery)`);
        const t0 = Date.now();
        try {
          const searchRes = await searchOnly(query, { topK: 8, service, kb: selectedKb });
          const elapsed = Date.now() - t0;
          console.log(
            `[chat] 🔍 search: ${elapsed}ms →`,
            searchRes.results?.length ?? 0,
            "results",
          );

          if (!searchRes.results || searchRes.results.length === 0) {
            return {
              found: false,
              knowledge_base: kbName,
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
            knowledge_base: kbName,
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
      "Fetch a web page by URL and extract its text content. Use when: (1) the user provides a specific URL, (2) after web search, to get full content of the most relevant results — do NOT skip this step, (3) you need to verify or get details from a specific source.",
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
        return { success: true, url, content: truncated, hint: "Page read complete. Consider if you need more searches with different keywords or URLs to fully answer the question." };
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
        "Search the web and get a list of results with brief summaries. This returns ONLY summaries, not full content. After calling this, you MUST call readPage with the top relevant URLs to get detailed content before answering.",
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

        return {
          answer,
          results,
          next_step: results.length > 0
            ? "IMPORTANT: (1) These are only summaries. Call readPage with the most relevant URLs (up to 3) to get full content. (2) After reading pages, consider if you need ADDITIONAL searches with different keywords or in a different language to cover more angles. Do NOT stop after just one search round."
            : undefined,
        };
      },
    });

    tools.readPage = tool({
      description:
        "Extract full content from specific URLs. You MUST call this after webSearch to read the most relevant results before answering. Do NOT answer based on search summaries alone. Can read up to 3 URLs at once.",
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

  // generateSlides: signal tool for conversational slide generation
  tools.generateSlides = tool({
    description:
      "ユーザーの依頼に基づいてプレゼンテーションスライドを生成します。" +
      "ユーザーがスライド/プレゼン/発表資料の作成を依頼した場合、会話で確認せず直接呼び出してください。",
    inputSchema: z.object({
      topic: z.string().describe("スライドのテーマ/タイトル"),
      content: z.string().describe("スライドに含めるべき内容の要約（ナレッジベースの検索結果があれば含める）"),
      instructions: z.string().optional().describe("ユーザーからの追加指示（スタイル、枚数、対象者、トーンなど）"),
    }),
    execute: async ({ topic, content, instructions }) => {
      console.log(`[chat] 🎨 generateSlides: "${topic}"`);
      return {
        triggered: true,
        topic,
        content,
        instructions: instructions ?? null,
      };
    },
  });

  // CRM tools (only when CRM_SERVICE_URL is configured)
  if (hasCrm) {
    tools.listDeals = tool({
      description: "CRM（Salesforce/Kintone）から商談一覧を取得します。「商談一覧」「案件リスト」「CRMの情報」等のキーワードで使用。",
      inputSchema: z.object({
        source: z.enum(["salesforce", "kintone"]).describe("CRM ソース"),
      }),
      execute: async ({ source }) => {
        console.log(`[chat] 📊 listDeals: source=${source}`);
        const t0 = Date.now();
        try {
          const endpoint = source === "salesforce" ? "/sf/list" : "/kintone/list";
          const res = await fetch(`${CRM_SERVICE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          console.log(`[chat] 📊 listDeals done: ${Date.now() - t0}ms, ${data.opportunities?.length ?? 0} deals`);
          return data;
        } catch (err) {
          console.error(`[chat] ❌ listDeals failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.fetchDealData = tool({
      description: "特定の商談の詳細データを取得します。分析前に必ず呼んでください。",
      inputSchema: z.object({
        source: z.enum(["salesforce", "kintone"]).describe("CRM ソース"),
        dealId: z.string().describe("商談/レコード ID"),
        objectType: z.string().optional().describe("SF オブジェクトタイプ（Opportunity, Lead, Account）"),
      }),
      execute: async ({ source, dealId, objectType }) => {
        console.log(`[chat] 📊 fetchDealData: source=${source} id=${dealId}`);
        const t0 = Date.now();
        try {
          const endpoint = source === "salesforce" ? "/sf/fetch" : "/kintone/fetch";
          const body: Record<string, unknown> = source === "salesforce"
            ? { opportunityId: dealId, objectType: objectType || "Opportunity" }
            : { recordId: dealId };
          const res = await fetch(`${CRM_SERVICE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const result = await res.json();
          console.log(`[chat] 📊 fetchDealData done: ${Date.now() - t0}ms`);
          // Truncate large arrays to control token usage
          if (result.data) {
            const d = result.data;
            if (d.activities?.length > 5) d.activities = d.activities.slice(0, 5);
            if (d.emails?.length > 5) d.emails = d.emails.slice(0, 5);
            if (d.feedItems?.length > 5) d.feedItems = d.feedItems.slice(0, 5);
            if (d.events?.length > 5) d.events = d.events.slice(0, 5);
          }
          return result;
        } catch (err) {
          console.error(`[chat] ❌ fetchDealData failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.analyzeDeal = tool({
      description: "商談データを分析します（受注確率、スコア、シナリオ、AI提案根拠）。fetchDealData の結果を渡してください。",
      inputSchema: z.object({
        data: z.any().describe("fetchDealData で取得した商談データ（SFData 形式）"),
      }),
      execute: async ({ data }) => {
        console.log(`[chat] 📊 analyzeDeal: ${data?.opportunity?.Name || "unknown"}`);
        const t0 = Date.now();
        try {
          const res = await fetch(`${CRM_SERVICE_URL}/deals/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data }),
          });
          const result = await res.json();
          console.log(`[chat] 📊 analyzeDeal done: ${Date.now() - t0}ms`);
          return result;
        } catch (err) {
          console.error(`[chat] ❌ analyzeDeal failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.generateProposal = tool({
      description: "提案書 PPTX を生成します。analyzeDeal の結果を渡してください。",
      inputSchema: z.object({
        data: z.any().describe("商談データ（SFData 形式）"),
        analysis: z.any().describe("analyzeDeal で取得した分析結果"),
      }),
      execute: async ({ data, analysis }) => {
        console.log(`[chat] 📊 generateProposal: ${data?.opportunity?.Name || "unknown"}`);
        return { triggered: true, data, analysis };
      },
    });

    tools.reviseRationale = tool({
      description: "ユーザーのフィードバックに基づいて分析根拠を修正します。",
      inputSchema: z.object({
        currentAnalysis: z.any().describe("現在の分析結果"),
        feedback: z.string().describe("ユーザーからの修正フィードバック"),
      }),
      execute: async ({ currentAnalysis, feedback }) => {
        console.log(`[chat] 📊 reviseRationale: feedback="${feedback.slice(0, 50)}..."`);
        const t0 = Date.now();
        try {
          const res = await fetch(`${CRM_SERVICE_URL}/deals/revise-rationale`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentAnalysis, feedback }),
          });
          const result = await res.json();
          console.log(`[chat] 📊 reviseRationale done: ${Date.now() - t0}ms`);
          return result;
        } catch (err) {
          console.error(`[chat] ❌ reviseRationale failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    console.log("[chat] 📊 CRM tools registered (crm-service connected)");
  }

  try {
    const t1 = Date.now();
    t.prompt = t1 - t.start;
    let firstTokenTime = 0;

    let systemPrompt = buildSystemPrompt(!!kb || autoDiscovery, clientTime, autoDiscovery);

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

    const chatModel = getChatModel(modelOverride);
    if (modelOverride) console.log(`[chat] 🤖 model override: ${modelOverride}`);

    const agent = new ToolLoopAgent({
      model: chatModel,
      instructions: useGemini ? systemPrompt : systemPrompt + "\n\n/no_think",
      tools,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 8192,
    });

    // Convert to model messages, then resolve file URLs to binary data
    const modelMessages = await convertToModelMessages(messages);
    await resolveServerFiles(modelMessages);

    const result = await agent.stream({
      messages: modelMessages,
      experimental_onStepStart() {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - t1;
          console.log(`[chat] 🚀 TTFT (${backendName} prefill): ${ttft}ms`);
        }
      },
      async onFinish({ usage }) {
        t.stream = Date.now() - t.start;
        console.log(
          `[chat] ✅ done: total=${t.stream}ms | prefill=${firstTokenTime ? firstTokenTime - t1 : "?"}ms gen=${firstTokenTime ? Date.now() - firstTokenTime : "?"}ms | tokens=${(usage as Record<string, unknown>)?.completionTokens ?? usage?.outputTokens ?? "?"}`,
        );
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
