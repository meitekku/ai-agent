import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  generateImage,
  smoothStream,
  stepCountIs,
  tool,
  ToolLoopAgent,
  UIMessage,
} from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getChatModel,
  useGemini,
  backendName,
  geminiGoogleSearch,
  ALLOWED_GEMINI_MODELS,
  isImageModel,
  geminiImageModel,
} from "@/lib/ollama-provider";
import {
  searchOnly,
  getKB,
  listKBs,
  type SearchResult,
  type KnowledgeBase,
} from "@/lib/rag-client";

import { TAVILY_API_KEY, CRM_SERVICE_URL, GEMINI_MODEL } from "@/lib/constants";
import { getEnabledSkillSummaries, getSkillByName } from "@/lib/skills-db";
import { WIDGET_SYSTEM_PROMPT } from "@/lib/widget-guidelines";
import { getChatFile, insertChatFile } from "@/lib/chat-files-db";
import { readStoredFile, saveFile } from "@/lib/file-storage";
import { saveMessages, updateConversation } from "@/lib/chat-db";
import { storeSession, getSession, updateSessionAnalysis } from "@/lib/proposal-session";

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
          (part as unknown as Record<string, unknown>).data = new Uint8Array(
            buffer,
          );
          (part as unknown as Record<string, unknown>).mimeType =
            row.media_type;
        } catch (err) {
          console.error(`[chat] resolveServerFiles failed for ${fileId}:`, err);
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
          (part as unknown as Record<string, unknown>).data = new Uint8Array(
            binary,
          );
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

function buildSystemPrompt(
  hasKb: boolean,
  clientTime?: string,
  autoDiscovery?: boolean,
): string {
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
- **ウェブ検索はクエリ分解（fan-out）で行う**: 複雑な質問は2〜4個の独立したサブクエリに分解し、それぞれ異なる角度から検索する。各クエリは1つのトピック/側面に絞る。1回の検索に複数トピックを詰め込まない
- **日英両方で検索する**: 日本語クエリと英語クエリの両方を実行する。英語の方が情報量が豊富なトピックが多い（例: 「クラゲ 生態 種類」→「jellyfish species biology ecology」）。結果は常にユーザーの言語（デフォルト日本語）で回答する
- **ウェブ検索後は必ず詳細を確認する**: ${webSearchToolName}の結果はサマリーのみ。関連性の高い結果は${hasTavily ? "readPage" : "readUrl"}で全文を取得してから回答する。サマリーだけで回答を書かない
- **検索クエリは事実ベース・中立に**: ユーザーの質問から核心キーワードを抽出し、事実的な関連語で補強する（3〜7語が最適）。主観的・装飾的な語（「不思議な」「すごい」等）や、ユーザーが求めていないカテゴリ語（「最新ニュース」「トレンド」等）を勝手に足さない。不確実な拡張語はハルシネーションリスクがあるため追加しない`;
  }

  // generateSlides ツール説明
  prompt += `
- **generateSlides**: ユーザーがスライド/プレゼン/発表資料の作成を依頼した場合、会話で質問せず直接呼び出す。ユーザーが指定したテーマ・内容・追加要望を topic/content/instructions にまとめて渡す。
  ナレッジベースの内容を使う場合は、先に searchKnowledgeBase で検索し、結果を content に含める。
- **suggestSlides**: 回答がスライド化に適している場合（解説・分析・比較・手順など構造化された内容）に呼び出す。短い挨拶・雑談・簡単な回答では不要。テキスト回答と同じステップで呼び出すこと。`;

  // generateImage ツール説明
  if (geminiImageModel) {
    prompt += `
- **generateImage**: ユーザーが画像生成を依頼した場合に使用。プロンプトは英語で具体的に記述すると高品質な結果が得られる。
  生成結果の画像 URL を \`![説明](url)\` 形式でマークダウンに埋め込んで表示すること。`;
  }

  // CRM ツール説明
  if (hasCrm) {
    prompt += `

## CRM・商談分析・提案書ツール

### ツール一覧
- **listDeals**: CRM（Salesforce/Kintone）から商談一覧を取得
- **fetchAndAnalyze**: 商談データ取得 + KB全検索 + Web検索 + AI分析を一括実行。CRM指定時は dealId、手動入力時は manualInput を渡す。完了すると提案書パネルが自動的に開く
- **reviseRationale**: ユーザーのフィードバックで分析根拠を修正。sessionKey + feedback を渡す

### ワークフロー（必須遵守）
「商談」「案件」「CRM」「提案」「分析」等のキーワードでこのワークフローを開始する。

**パターン A: CRM データ源あり**
1. listDeals で商談一覧を取得・表形式で表示。「どの商談を分析しますか？」と聞く
2. ユーザーが選択したら fetchAndAnalyze(source, dealId) を呼ぶ（KB/Web検索・分析は自動実行）
3. 分析結果の要点を簡潔に提示（提案書パネルは自動で開く）

**パターン B: 手動入力**
ユーザーが「山田製造の商談を分析して」等と直接説明した場合：
1. fetchAndAnalyze(source:"manual", manualInput:{ companyName, industry, dealName, challenges, ... }) を呼ぶ
2. 分析結果の要点を簡潔に提示（提案書パネルは自動で開く）

**重要ルール**:
- fetchAndAnalyze 完了後も、追加で searchKnowledgeBase / webSearch を呼んで情報を補強してよい。多くの情報源を活用するほど分析の質が上がる
- fetchAndAnalyze 完了後、提案書スライドは右側の ProposalPanel で生成される（自動で開く）。**generateSlides は呼ばない**こと（ProposalPanel と機能が重複するため）。ただしユーザーが明示的に「スライドを作って」と依頼した場合は generateSlides を使ってよい
- ユーザーが「提案書を作って」等と直接依頼した場合も、listDeals から始めてワークフロー全体を実行する

### 分析結果の提示方法
fetchAndAnalyze 完了後、分析結果をユーザーに提示する際は以下を心がける：
- **KPI（受注確率・健全度・推薦サービス比較など）は show-widget を使って視覚的に表示**する。例: ゲージチャート、レーダーチャート、比較カード
- テキストによる要点解説（課題分析・推奨アクション・ROI 試算）は通常の Markdown で記述
- 「提案書パネルが右側に開いています」と案内し、スライド生成を促す`;
  }

  // 情報の信頼度ヒエラルキー
  if (hasKb) {
    prompt += `

## 情報の優先順位
1. **KB の検索結果** — 最も信頼性が高い。具体的なデータ・引用を優先使用
2. ${
      hasWeb
        ? `**ウェブ検索結果** — 最新情報や KB にない情報の補完。出典 URL を必ず記載
3. `
        : ""
    }**自身の知識** — KB${hasWeb ? "・ウェブ" : ""}の情報がない場合のみ使用。KB の情報と混同しない

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
- ${webSearchToolName}:
  - **クエリ構造**: 核心キーワード（専有名詞・主題語）＋ 事実的な関連語で 3〜7語。会話的フレーズ（「について教えて」）は除去
  - **良い例**: 「クラゲについて教えて」→①「クラゲ 生態 特徴 種類」②「jellyfish species biology habitat」
  - **悪い例**: 「クラゲ 不思議な生態 最新ニュース」（主観語＋無関係カテゴリ）
  - **日英並行検索**: 英語の方が情報量が豊富なことが多い。日本語＋英語の両方で検索し、結果はユーザーの言語で統合回答
  - **不確実な拡張語を足さない**: 知らないトピックについて推測でキーワードを追加すると検索品質が低下する（SIGIR 2025）
  - **Fan-out**: 複雑な質問は2〜4個のサブクエリに分解。各クエリは1つの側面に集中（例: ①「社名 業績 決算」②「社名 評判 口コミ」③「社名 株価 推移」）
  - **鮮度が重要な場合のみ** 年号や timeRange パラメータを使う`;
  }

  return prompt;
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  let service: "lightrag" | "pageindex";
  let kb: string | null = null;
  let clientTime: string | undefined;
  let modelOverride: string | null = null;
  let chatId: string | null = null;
  let parentId: string | null = null;
  let thinking = false;
  try {
    const body = await req.json();
    messages = body.messages;
    service = body.service === "pageindex" ? "pageindex" : "lightrag";
    kb = body.kb ?? null;
    clientTime = body.clientTime;
    modelOverride = body.model ?? null;
    chatId = body.chatId ?? null;
    parentId = body.parentId ?? null;
    thinking = body.thinking === true;
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
      kbList = allKbs.filter((k) => k.doc_count > 0);
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
    let kbName = kb;
    try {
      const kbInfo = await getKB(kb);
      kbName = kbInfo?.name || kb;
      if (kbInfo?.title && kbInfo?.description) {
        kbDescription = `ナレッジベース「${kbInfo.title}」を検索: ${kbInfo.description}。ユーザーの質問がこのトピックに関連する可能性がある場合に使用。`;
      } else {
        // title が空 → バックグラウンドで自動生成（次回以降に反映）
        const origin =
          req.headers.get("origin") || req.headers.get("host") || "";
        const base = origin.startsWith("http") ? origin : `http://${origin}`;
        fetch(`${base}/api/kbs/${kb}/generate`, { method: "POST" }).catch(
          () => {},
        );
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
    const kbDescriptions = kbList
      .map((k) => {
        const label = k.description ? `${k.name} — ${k.description}` : k.name;
        return `- \`${k.slug}\`: ${label}（${k.doc_count}件）`;
      })
      .join("\n");

    const slugs = kbList.map((k) => k.slug);

    tools.searchKnowledgeBase = tool({
      description: `利用可能なナレッジベースから関連情報を検索します。質問に最も関連する KB を選んでください。\n\n利用可能な KB:\n${kbDescriptions}`,
      inputSchema: z.object({
        query: z.string().describe("Search query for the knowledge base"),
        kb: z
          .enum([slugs[0], ...slugs.slice(1)] as [string, ...string[]])
          .describe("検索するナレッジベースの slug"),
      }),
      execute: async ({ query, kb: selectedKb }) => {
        const kbInfo = kbList.find((k) => k.slug === selectedKb);
        const kbName = kbInfo?.name || selectedKb;
        console.log(
          `[chat] 🔍 searchKnowledgeBase: "${query}" kb=${selectedKb} (auto-discovery)`,
        );
        const t0 = Date.now();
        try {
          const searchRes = await searchOnly(query, {
            topK: 8,
            service,
            kb: selectedKb,
          });
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
        return {
          success: true,
          url,
          content: truncated,
          hint: "Page read complete. Consider if you need more searches with different keywords or URLs to fully answer the question.",
        };
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
          next_step:
            results.length > 0
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
      content: z
        .string()
        .describe(
          "スライドに含めるべき内容の要約（ナレッジベースの検索結果があれば含める）",
        ),
      instructions: z
        .string()
        .optional()
        .describe(
          "ユーザーからの追加指示（スタイル、枚数、対象者、トーンなど）",
        ),
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

  // suggestSlides: lightweight signal — AI calls this when the response is suitable for slide generation
  tools.suggestSlides = tool({
    description:
      "回答内容がプレゼンテーション資料に適していると判断した場合に呼び出す。" +
      "解説、分析結果、比較、手順説明、構造化された情報など、スライド化の価値がある回答で使用。" +
      "短い挨拶、雑談、簡単な一言回答、コードのみの回答では呼び出さない。",
    inputSchema: z.object({}),
    execute: async () => ({ suggested: true }),
  });

  // loadSkill: progressive disclosure — load full skill content on demand
  tools.loadSkill = tool({
    description:
      "スキルの完全な指示を読み込む。ユーザーのタスクに関連するスキルがあれば確認せず自動で呼び出す。",
    inputSchema: z.object({
      name: z.string().describe("読み込むスキル名"),
    }),
    execute: async ({ name }) => {
      console.log(`[chat] 📖 loadSkill: ${name}`);
      const skill = await getSkillByName(name);
      if (!skill) return { error: `スキル「${name}」が見つかりません` };
      return { name: skill.name, content: skill.content };
    },
  });

  // CRM tools (only when CRM_SERVICE_URL is configured)
  if (hasCrm) {
    tools.listDeals = tool({
      description:
        "CRM（Salesforce/Kintone）から商談一覧を取得します。「商談一覧」「案件リスト」「CRMの情報」等のキーワードで使用。",
      inputSchema: z.object({
        source: z.enum(["salesforce", "kintone"]).describe("CRM ソース"),
      }),
      execute: async ({ source }) => {
        console.log(`[chat] 📊 listDeals: source=${source}`);
        const t0 = Date.now();
        try {
          const endpoint =
            source === "salesforce" ? "/sf/list" : "/kintone/list";
          const res = await fetch(`${CRM_SERVICE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          console.log(
            `[chat] 📊 listDeals done: ${Date.now() - t0}ms, ${data.opportunities?.length ?? 0} deals`,
          );
          return data;
        } catch (err) {
          console.error(`[chat] ❌ listDeals failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.fetchAndAnalyze = tool({
      description:
        "商談データ取得 + KB全検索 + Web検索 + AI分析を一括実行します。CRM指定時は source + dealId、手動入力時は source:'manual' + manualInput を渡してください。",
      inputSchema: z.object({
        source: z
          .enum(["salesforce", "kintone", "manual"])
          .describe("データ源。CRM または manual"),
        dealId: z
          .string()
          .optional()
          .describe("CRM 商談 ID（source が salesforce/kintone の場合）"),
        objectType: z
          .string()
          .optional()
          .describe("SF オブジェクトタイプ（Opportunity, Lead, Account）"),
        manualInput: z
          .object({
            companyName: z.string().describe("会社名"),
            industry: z.string().optional().describe("業界"),
            dealName: z.string().describe("案件名"),
            challenges: z.string().optional().describe("課題"),
            budget: z.number().optional().describe("予算（円）"),
            details: z.string().optional().describe("詳細説明"),
            employeeCount: z.number().optional().describe("従業員数"),
          })
          .optional()
          .describe("手動入力データ（source が manual の場合）"),
      }),
      execute: async ({ source, dealId, objectType, manualInput }) => {
        console.log(
          `[chat] 📊 fetchAndAnalyze: source=${source} dealId=${dealId || "manual"}`,
        );
        const t0 = Date.now();
        try {
          // 1. SFData 取得
          let sfData: Record<string, unknown>;
          if (source === "manual") {
            if (!manualInput) {
              return { error: "manualInput is required for source='manual'" };
            }
            sfData = {
              account: {
                Name: manualInput.companyName,
                Industry: manualInput.industry || "未設定",
                Description: manualInput.details || "",
                NumberOfEmployees: manualInput.employeeCount,
              },
              opportunity: {
                Name: manualInput.dealName,
                Amount: manualInput.budget,
                Description: `${manualInput.challenges || ""}\n${manualInput.details || ""}`.trim(),
                StageName: "商談中",
              },
              activities: [],
              contacts: [],
            };
          } else {
            const endpoint =
              source === "salesforce" ? "/sf/fetch" : "/kintone/fetch";
            const body: Record<string, unknown> =
              source === "salesforce"
                ? { opportunityId: dealId, objectType: objectType || "Opportunity" }
                : { recordId: dealId };
            const fetchRes = await fetch(`${CRM_SERVICE_URL}${endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const fetchResult = await fetchRes.json();
            if (fetchResult.error) return { error: fetchResult.error };
            sfData = fetchResult.data || fetchResult;
            // Truncate large arrays
            const d = sfData as Record<string, unknown[]>;
            for (const key of ["activities", "emails", "feedItems", "events"]) {
              if (Array.isArray(d[key]) && d[key].length > 5)
                d[key] = d[key].slice(0, 5);
            }
          }
          console.log(`[chat] 📊 fetchAndAnalyze: data fetched (${Date.now() - t0}ms)`);

          // 2. KB 全検索（並列）
          const contextParts: string[] = [];
          try {
            const allKbs = await listKBs();
            const kbsWithDocs = allKbs.filter((k) => k.doc_count > 0);
            const account = sfData.account as Record<string, unknown> | undefined;
            const opp = sfData.opportunity as Record<string, unknown> | undefined;
            const searchQuery = [account?.Name, opp?.Name, account?.Industry]
              .filter(Boolean)
              .join(" ");
            if (searchQuery && kbsWithDocs.length > 0) {
              const kbResults = await Promise.allSettled(
                kbsWithDocs.map((kb) =>
                  searchOnly(searchQuery, { topK: 5, kb: kb.slug }),
                ),
              );
              for (let i = 0; i < kbResults.length; i++) {
                const r = kbResults[i];
                if (r.status === "fulfilled" && r.value.results?.length > 0) {
                  const kbName = kbsWithDocs[i].name;
                  const texts = r.value.results
                    .map((doc: SearchResult) => doc.content)
                    .filter(Boolean)
                    .join("\n");
                  if (texts) contextParts.push(`【${kbName}】\n${texts}`);
                }
              }
              console.log(
                `[chat] 📊 fetchAndAnalyze: KB search done, ${contextParts.length} KBs with results`,
              );
            }
          } catch (e) {
            console.error("[chat] KB search failed:", e);
          }

          // 3. Web 検索（Tavily あれば）
          if (hasTavily) {
            try {
              const account = sfData.account as Record<string, unknown> | undefined;
              const webQuery = [account?.Name, account?.Industry]
                .filter(Boolean)
                .join(" ");
              if (webQuery) {
                const webRes = await fetch("https://api.tavily.com/search", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${TAVILY_API_KEY}`,
                  },
                  body: JSON.stringify({
                    query: webQuery,
                    max_results: 3,
                    search_depth: "basic",
                    topic: "general",
                    include_answer: true,
                  }),
                });
                if (webRes.ok) {
                  const webData = await webRes.json();
                  const webTexts = (webData.results ?? [])
                    .map(
                      (r: { title: string; url: string; content: string }) =>
                        `${r.title}: ${r.content}`,
                    )
                    .join("\n");
                  if (webTexts) contextParts.push(`【ウェブ検索】\n${webTexts}`);
                  console.log("[chat] 📊 fetchAndAnalyze: Web search done");
                }
              }
            } catch (e) {
              console.error("[chat] Web search failed:", e);
            }
          }

          // 4. additionalContext 結合
          const additionalContext = contextParts.join("\n\n");

          // 5. analyzeDeal
          const analyzeRes = await fetch(`${CRM_SERVICE_URL}/deals/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: sfData,
              additionalContext: additionalContext || undefined,
            }),
          });
          const analyzeRaw = await analyzeRes.json();
          if (analyzeRaw.error)
            return { error: `分析失敗: ${analyzeRaw.error}` };
          // crm-service returns { analysis: { ...scores, rationale } } — unwrap
          const analysisData = (analyzeRaw.analysis ?? analyzeRaw) as Record<string, unknown>;
          console.log(
            `[chat] 📊 fetchAndAnalyze: analysis done (total ${Date.now() - t0}ms)`,
          );

          // 6. セッション保存
          const sessionKey = storeSession(
            sfData,
            analysisData,
            additionalContext,
          );

          // 7. 全量返却
          return {
            sessionKey,
            data: sfData,
            analysis: analysisData,
          };
        } catch (err) {
          console.error(`[chat] ❌ fetchAndAnalyze failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.reviseRationale = tool({
      description:
        "ユーザーのフィードバックに基づいて分析根拠を修正します。fetchAndAnalyze の sessionKey + フィードバックを渡してください。",
      inputSchema: z.object({
        sessionKey: z.string().describe("fetchAndAnalyze で返された sessionKey"),
        feedback: z.string().describe("ユーザーからの修正フィードバック"),
      }),
      execute: async ({ sessionKey, feedback }) => {
        console.log(
          `[chat] 📊 reviseRationale: sessionKey=${sessionKey} feedback="${feedback.slice(0, 50)}..."`,
        );
        const t0 = Date.now();
        try {
          const session = getSession(sessionKey);
          if (!session) {
            return { error: "セッションが見つかりません（期限切れの可能性）" };
          }
          const res = await fetch(`${CRM_SERVICE_URL}/deals/revise-rationale`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentAnalysis: session.analysis,
              feedback,
              additionalContext: session.additionalContext || undefined,
            }),
          });
          const result = await res.json();
          console.log(`[chat] 📊 reviseRationale done: ${Date.now() - t0}ms`);
          // Merge revised rationale + analysis updates into session
          if (!result.error && session) {
            const merged = { ...session.analysis };
            if (result.rationale) merged.rationale = result.rationale;
            if (result.analysisUpdates) {
              Object.assign(merged, result.analysisUpdates);
            }
            updateSessionAnalysis(sessionKey, merged);
          }
          return result;
        } catch (err) {
          console.error(`[chat] ❌ reviseRationale failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    console.log("[chat] 📊 CRM tools registered (crm-service connected)");
  }

  // Image generation tool (available to all text models when geminiImageModel exists)
  if (geminiImageModel) {
    tools.generateImage = tool({
      description:
        "テキストの説明から画像を生成します。ユーザーが「描いて」「画像を作って」「イラスト」等を依頼した場合に使用。",
      inputSchema: z.object({
        prompt: z.string().describe("生成する画像の詳細な説明（英語推奨）"),
        aspectRatio: z
          .enum(["1:1", "3:4", "4:3", "9:16", "16:9"])
          .optional()
          .describe("画像のアスペクト比"),
      }),
      execute: async ({ prompt, aspectRatio }) => {
        console.log(`[chat] 🎨 generateImage: "${prompt.slice(0, 50)}..."`);
        const t0 = Date.now();
        try {
          const result = await generateImage({
            model: geminiImageModel!,
            prompt,
            aspectRatio,
            providerOptions: { google: { personGeneration: "allow_adult" } },
          });
          const savedUrls: string[] = [];
          for (const img of result.images) {
            const ext = img.mediaType === "image/jpeg" ? ".jpg" : ".png";
            const name = `generated-${Date.now()}${ext}`;
            const { id, storedPath } = await saveFile(
              Buffer.from(img.uint8Array),
              name,
            );
            await insertChatFile({
              id,
              originalName: name,
              storedPath,
              mediaType: img.mediaType,
              sizeBytes: img.uint8Array.length,
            });
            savedUrls.push(`/api/files/${id}`);
          }
          console.log(
            `[chat] 🎨 generateImage done: ${Date.now() - t0}ms, ${savedUrls.length} images`,
          );
          return {
            success: true,
            images: savedUrls.map((url, i) => ({
              url,
              mediaType: result.images[i].mediaType,
            })),
          };
        } catch (err) {
          console.error(`[chat] ❌ generateImage failed:`, err);
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    });
  }

  try {
    const t1 = Date.now();
    t.prompt = t1 - t.start;

    const selectedModel =
      modelOverride && ALLOWED_GEMINI_MODELS.has(modelOverride)
        ? modelOverride
        : GEMINI_MODEL;

    // Convert to model messages, then resolve file URLs to binary data
    const modelMessages = await convertToModelMessages(messages);
    await resolveServerFiles(modelMessages);

    // === IMAGE MODEL PATH ===
    if (isImageModel(selectedModel)) {
      console.log(`[chat] 🎨 Image model path: ${selectedModel}`);
      const chatModel = getChatModel(modelOverride);

      const result = await generateText({
        model: chatModel,
        messages: modelMessages,
        system: `あなたは画像生成・編集が可能な AI アシスタントです。
ユーザーの指示に基づいて画像を生成・編集します。
- ユーザーが画像を添付した場合、指示に従って編集してください
- テキストでの説明も併せて提供してください
- ユーザーの質問と同じ言語で回答してください`,
        providerOptions: {
          google: { responseModalities: ["TEXT", "IMAGE"] },
        },
        // No abortSignal — let image generation complete even if client disconnects
      });

      // Save generated images to disk + DB
      const savedFiles: { url: string; mediaType: string }[] = [];
      for (const file of result.files ?? []) {
        const ext =
          file.mediaType === "image/png"
            ? ".png"
            : file.mediaType === "image/jpeg"
              ? ".jpg"
              : file.mediaType === "image/webp"
                ? ".webp"
                : ".png";
        const name = `generated-${Date.now()}${ext}`;
        const { id, storedPath } = await saveFile(
          Buffer.from(file.uint8Array),
          name,
        );
        await insertChatFile({
          id,
          originalName: name,
          storedPath,
          mediaType: file.mediaType,
          sizeBytes: file.uint8Array.length,
        });
        savedFiles.push({ url: `/api/files/${id}`, mediaType: file.mediaType });
      }

      console.log(
        `[chat] 🎨 Image result: text=${result.text?.length ?? 0} chars, files=${savedFiles.length}`,
      );

      // Build UIMessageStream manually
      const stream = createUIMessageStream({
        originalMessages: messages,
        execute: async ({ writer }) => {
          writer.write({ type: "start-step" });

          if (result.text) {
            const textId = nanoid();
            writer.write({ type: "text-start", id: textId });
            writer.write({
              type: "text-delta",
              id: textId,
              delta: result.text,
            });
            writer.write({ type: "text-end", id: textId });
          }

          for (const f of savedFiles) {
            writer.write({ type: "file", url: f.url, mediaType: f.mediaType });
          }

          if (!result.text && savedFiles.length === 0) {
            const errId = nanoid();
            writer.write({ type: "text-start", id: errId });
            writer.write({
              type: "text-delta",
              id: errId,
              delta:
                "画像の生成に失敗しました。別のプロンプトをお試しください。",
            });
            writer.write({ type: "text-end", id: errId });
          }

          writer.write({ type: "finish-step" });
          writer.write({ type: "finish", finishReason: "stop" });
        },
        onFinish: async ({ responseMessage }) => {
          if (!chatId) return;
          try {
            const lastUserMsg = [...messages]
              .reverse()
              .find((m) => m.role === "user");
            if (!lastUserMsg) return;
            const toSave = [
              {
                id: lastUserMsg.id,
                parent_id: parentId,
                role: "user",
                parts: lastUserMsg.parts as unknown[],
              },
              {
                id: responseMessage.id,
                parent_id: lastUserMsg.id,
                role: "assistant",
                parts: responseMessage.parts as unknown[],
              },
            ];
            await saveMessages(chatId, toSave);
            await updateConversation(chatId, {
              active_leaf_id: responseMessage.id,
            });
            console.log(
              `[chat] 💾 Image path: saved ${toSave.length} messages for conv=${chatId}`,
            );
          } catch (e) {
            console.error("[chat] image path save failed:", e);
          }
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    // === EXISTING TEXT MODEL PATH ===
    let firstTokenTime = 0;

    let systemPrompt = buildSystemPrompt(
      !!kb || autoDiscovery,
      clientTime,
      autoDiscovery,
    );

    // Inject widget guidelines
    systemPrompt += "\n\n" + WIDGET_SYSTEM_PROMPT;

    // Inject skill summaries into system prompt (progressive disclosure)
    try {
      const skillSummaries = await getEnabledSkillSummaries();
      if (skillSummaries.length > 0) {
        const list = skillSummaries
          .map((s) => `- ${s.name}: ${s.description}`)
          .join("\n");
        systemPrompt += `\n\n## スキル（重要・積極活用）\n\n以下のスキルが有効です。ユーザーの質問やタスクに関連するスキルがあれば、**聞かずに自動で** \`loadSkill\` を呼んで読み込み、その指示に従って回答してください。「スキルを使いますか？」と確認しない。関連性が少しでもあれば読み込む — 不要な読み込みのコストは低く、活用漏れのコストは高い。\n\n${list}`;
      }
    } catch (e) {
      console.error("[chat] skills injection failed:", e);
    }

    const chatModel = getChatModel(modelOverride);
    if (modelOverride)
      console.log(`[chat] 🤖 model override: ${modelOverride}`);

    const agent = new ToolLoopAgent({
      model: chatModel,
      instructions: useGemini ? systemPrompt : systemPrompt + "\n\n/no_think",
      tools,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 8192,
      ...(thinking && useGemini
        ? {
            providerOptions: {
              google: {
                thinkingConfig: {
                  thinkingBudget: 8192,
                  includeThoughts: true,
                },
              },
            },
          }
        : {}),
    });

    const result = await agent.stream({
      messages: modelMessages,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: new Intl.Segmenter("ja", { granularity: "word" }),
      }),
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

    // Ensure agent runs to completion even if client disconnects
    void result.consumeStream({
      onError: (e) => console.error("[chat] consumeStream error:", e),
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        // Server-side persistence — fires even on client disconnect (via TransformStream cancel handler)
        if (!chatId) return;
        try {
          const lastUserMsg = [...messages]
            .reverse()
            .find((m) => m.role === "user");
          if (!lastUserMsg) return;
          const toSave = [
            {
              id: lastUserMsg.id,
              parent_id: parentId,
              role: "user",
              parts: lastUserMsg.parts as unknown[],
            },
            {
              id: responseMessage.id,
              parent_id: lastUserMsg.id,
              role: "assistant",
              parts: responseMessage.parts as unknown[],
            },
          ];
          await saveMessages(chatId, toSave);
          await updateConversation(chatId, {
            active_leaf_id: responseMessage.id,
          });
          console.log(
            `[chat] 💾 Server-side saved ${toSave.length} msgs for conv=${chatId}`,
          );
        } catch (e) {
          console.error("[chat] server-side save failed:", e);
        }
      },
    });
  } catch (err) {
    console.error("[chat] streaming failed:", err);
    return Response.json(
      { error: "Chat service unavailable" },
      { status: 502 },
    );
  }
}
