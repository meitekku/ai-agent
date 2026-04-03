import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
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
  providerOptionsKey,
} from "@/lib/ollama-provider";
import {
  searchOnly,
  getKB,
  listKBs,
  type SearchResult,
  type KnowledgeBase,
} from "@/lib/rag-client";

import pg from "pg";
import { TAVILY_API_KEY, CRM_SERVICE_URL, TASK_WORKER_URL, GEMINI_MODEL } from "@/lib/constants";
import { getEnabledSkillSummaries, getSkillByName } from "@/lib/skills-db";
import { WIDGET_SYSTEM_PROMPT } from "@/lib/widget-guidelines";
import { getChatFile, insertChatFile } from "@/lib/chat-files-db";
import { readStoredFile, saveFile } from "@/lib/file-storage";
import { saveMessages, updateConversation } from "@/lib/chat-db";
import { storeSession, getSession, updateSessionAnalysis } from "@/lib/proposal-session";
import {
  getSlideDeckDetail,
  updateSlideAndVersion,
  ensureSlideTables,
} from "@/lib/slide-db";
import {
  SLIDE_HTML_SYSTEM_PROMPT,
  extractHtmlFromResponse,
} from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const hasTavily = !!TAVILY_API_KEY;
const hasGoogleSearch = !hasTavily && !!geminiGoogleSearch;
const hasCrm = !!CRM_SERVICE_URL;
const hasScheduler = !!TASK_WORKER_URL;

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";
let roPool: pg.Pool | null = null;
function getReadOnlyPool(): pg.Pool {
  if (!roPool) {
    roPool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  }
  return roPool;
}

// ---------------------------------------------------------------------------
// Skills — progressive disclosure (official AI SDK pattern)
// ---------------------------------------------------------------------------

interface SkillSummary {
  name: string;
  description: string;
}

function buildSkillsPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) return "";
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return `\n\n## スキル（重要・積極活用）\n\n以下のスキルが有効です。ユーザーの質問やタスクに関連するスキルがあれば、**聞かずに自動で** \`loadSkill\` を呼んで読み込み、その指示に従って回答してください。「スキルを使いますか？」と確認しない。関連性が少しでもあれば読み込む — 不要な読み込みのコストは低く、活用漏れのコストは高い。\n\n${list}`;
}

const skillCallOptionsSchema = z.object({
  skills: z.array(
    z.object({ name: z.string(), description: z.string() }),
  ),
});

const loadSkillTool = tool({
  description:
    "スキルの完全な指示を読み込む。ユーザーのタスクに関連するスキルがあれば確認せず自動で呼び出す。",
  inputSchema: z.object({
    name: z.string().describe("読み込むスキル名"),
  }),
  execute: async ({ name }, { experimental_context }) => {
    const ctx = experimental_context as
      | { skills: SkillSummary[] }
      | undefined;
    const skills = ctx?.skills ?? [];
    // Validate against known skills — reject hallucinated names without DB hit
    if (
      skills.length > 0 &&
      !skills.find((s) => s.name.toLowerCase() === name.toLowerCase())
    ) {
      console.log(`[chat] 📖 loadSkill: "${name}" — not in available skills`);
      return { error: `スキル「${name}」が見つかりません` };
    }
    console.log(`[chat] 📖 loadSkill: ${name}`);
    const skill = await getSkillByName(name);
    if (!skill) return { error: `スキル「${name}」が見つかりません` };
    return { name: skill.name, content: skill.content };
  },
});

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
- **generateSlides**: 商談・提案書・CRM に関係ない一般的なスライド作成依頼の場合のみ使用（例: 「機械学習の解説スライドを作って」「チーム紹介スライドを作って」）。CRM の商談データや提案書が関係する場合は必ず fetchAndAnalyze ワークフローを使うこと。
  ナレッジベースの内容を使う場合は、先に searchKnowledgeBase で検索し、結果を content に含める。
- **suggestSlides**: 回答がスライド化に適している場合（解説・分析・比較・手順など構造化された内容）に呼び出す。短い挨拶・雑談・簡単な回答では不要。テキスト回答と同じステップで呼び出すこと。`;

  // 新ツール説明
  prompt += `
- **analyzeImage**: 画像URLまたはfileIdを指定して画像をAI分析。OCR、チャート読取、オブジェクト識別、画像に関する質問に回答。ユーザーが画像について質問した場合に使用
- **readFile**: 以前アップロード/生成されたファイルを読み取る。fileIdを指定。CSVやJSONの内容確認、アップロードされたドキュメントの分析に使用
- **httpRequest**: 任意のREST APIを呼び出す（GET/POST/PUT等）。天気、為替、株価、Webhook等の外部API連携に使用。ウェブ検索/ページ読取には専用ツールを使うこと
- **queryDatabase**: PostgreSQLに対してSELECTクエリを実行（読取専用）。チャット統計、タスク実行履歴、スライド情報等の集計・分析に使用`;

  // generateImage ツール説明
  if (useGemini) {
    prompt += `
- **generateImage**: ユーザーが画像生成・編集を依頼した場合に**即座に呼び出す**。ユーザーが画像を添付している場合はその画像を編集できる。
  **重要**: プロンプトの書き換え・翻訳・最適化は一切不要。ユーザーの原文がそのまま画像モデルに渡されるため、prompt にはユーザーの言葉をそのままコピーすること。
  画像はツール結果として自動表示されるため、マークダウンへの埋め込みは不要。`;
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
- fetchAndAnalyze 完了後、提案書スライドは右側の ProposalPanel で生成される（自動で開く）。**generateSlides は絶対に呼ばない**こと（ProposalPanel と機能が重複するため）
- ユーザーが「提案書を作って」「スライドを作って」「プレゼン資料を作って」等と依頼した場合も、**generateSlides ではなく fetchAndAnalyze ワークフロー**（listDeals → fetchAndAnalyze）を使う。提案書・スライド生成は常にこのワークフロー経由で行う

**データソース分離（必須）**:
- Salesforce の商談を分析する場合、Kintone のデータ（モックデータ含む）を混ぜてはいけない。逆も同様
- KB 検索結果やウェブ検索結果に他方の CRM のデータが含まれていても、現在のデータソースに関係ない情報は無視・除外して回答すること
- listDeals で一方の CRM を使い始めたら、同じワークフロー内でもう一方の CRM に切り替えないこと
- ユーザーが明示的に「Kintone のデータも見て」「Salesforce も参照して」等と指示した場合のみ、両方を併用してよい

### 分析結果の提示方法
fetchAndAnalyze 完了後、分析結果をユーザーに提示する際は以下を心がける：
- **KPI（受注確率・健全度・推薦サービス比較など）は show-widget を使って視覚的に表示**する。例: ゲージチャート、レーダーチャート、比較カード
- テキストによる要点解説（課題分析・推奨アクション・ROI 試算）は通常の Markdown で記述
- 「提案書パネルが右側に開いています」と案内し、スライド生成を促す
- **fetchAndAnalyze 完了後にユーザーが「スライド生成して」「詳細なスライドを」等と依頼した場合**: suggestSlides や generateSlides を呼ばないこと。「右側の提案書パネルからスライドを生成できます。パネルの『次へ』ボタンを進めてください」とテキストで案内するだけでよい`;
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

## 出典の記載（厳守）
出典は必ず**該当する文の直後**にインラインで記載すること。段落末尾やまとめ箇所への一括記載は禁止。
- KB 出典: 該当する文の直後に「（出典: ドキュメント名, p.X）」を付ける。例:「離職率は15%に達しています（出典: 人事レポート2025, p.12）。これは業界平均を上回る水準です（出典: 業界動向調査, p.5）。」
- ウェブ出典: 該当する文の直後に [タイトル](URL) 形式で付ける。例:「売上は前年比20%増加した（[日経記事](https://...)）。」
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
  let activeDeckId: number | null = null;
  let slidesSummary: string | null = null;
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
    activeDeckId = body.deckId ?? null;
    slidesSummary = body.slidesSummary ?? null;
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
      "商談・提案書・CRM に関係ない一般的なプレゼンテーションスライドを生成します。" +
      "提案書やCRM関連のスライドには使用しないでください（fetchAndAnalyze ワークフローを使うこと）。",
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

  // ---- analyzeImage ------------------------------------------------
  tools.analyzeImage = tool({
    description:
      "画像を分析します（Gemini Vision）。画像の内容説明、テキスト抽出（OCR）、チャート/表の読取、オブジェクト識別、画像に関する質問に回答。sourceは画像URL（https://...）またはfileId（/api/files/xxxで配信されるファイルのID）。",
    inputSchema: z.object({
      source: z
        .string()
        .describe("画像URL（https://...）または /api/files/ のファイルID"),
      question: z
        .string()
        .optional()
        .describe("画像についての質問。省略時は一般的な説明を生成"),
    }),
    execute: async ({ source, question }) => {
      console.log(`[chat] 👁️ analyzeImage: ${source.slice(0, 60)}`);
      const t0 = Date.now();
      try {
        let imageData: Uint8Array;
        let mimeType = "image/png";

        if (source.startsWith("http://") || source.startsWith("https://")) {
          const res = await fetch(source, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RAGBot/1.0)" },
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok)
            return { success: false, error: `画像取得失敗: HTTP ${res.status}` };
          mimeType = res.headers.get("content-type") || "image/png";
          imageData = new Uint8Array(await res.arrayBuffer());
        } else {
          // fileId → read from disk
          const fileRow = await getChatFile(source);
          if (!fileRow)
            return { success: false, error: `ファイルが見つかりません: ${source}` };
          const buffer = await readStoredFile(fileRow.stored_path);
          imageData = new Uint8Array(buffer);
          mimeType = fileRow.media_type;
        }

        const prompt = question || "この画像を詳細に説明してください。テキストがあれば抽出し、チャートや表があればデータを読み取ってください。";
        const imageModel = getChatModel();
        const result = await generateText({
          model: imageModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "image" as const, image: imageData, mediaType: mimeType },
                { type: "text" as const, text: prompt },
              ],
            },
          ],
        });

        console.log(`[chat] 👁️ analyzeImage done: ${Date.now() - t0}ms`);
        return {
          success: true,
          analysis: result.text || "分析結果なし",
        };
      } catch (err) {
        console.error(`[chat] ❌ analyzeImage failed:`, err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ---- readFile ---------------------------------------------------
  tools.readFile = tool({
    description:
      "以前アップロード/生成されたファイルの内容を読み取ります。/api/files/{id} で配信されるファイルのIDを指定。テキストファイル（CSV, JSON, Markdown等）はテキスト内容を、バイナリファイルはサイズ情報を返します。",
    inputSchema: z.object({
      fileId: z
        .string()
        .describe("ファイルID（/api/files/ のパスから取得）"),
    }),
    execute: async ({ fileId }) => {
      console.log(`[chat] 📂 readFile: ${fileId}`);
      try {
        const fileRow = await getChatFile(fileId);
        if (!fileRow)
          return { success: false, error: `ファイルが見つかりません: ${fileId}` };

        const contentType = fileRow.media_type || "application/octet-stream";

        if (
          contentType.startsWith("text/") ||
          contentType.includes("json") ||
          contentType.includes("xml") ||
          contentType.includes("csv") ||
          contentType.includes("markdown")
        ) {
          const buffer = await readStoredFile(fileRow.stored_path);
          const text = Buffer.from(buffer).toString("utf-8");
          return {
            success: true,
            filename: fileRow.original_name,
            mediaType: contentType,
            content: text.slice(0, 50000),
            truncated: text.length > 50000,
          };
        }

        return {
          success: true,
          filename: fileRow.original_name,
          mediaType: contentType,
          size: fileRow.size_bytes,
          note: "バイナリファイルです。画像は analyzeImage で分析できます。",
        };
      } catch (err) {
        console.error(`[chat] ❌ readFile failed:`, err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ---- httpRequest ------------------------------------------------
  tools.httpRequest = tool({
    description:
      "任意のURLにHTTPリクエストを送信。GET/POST/PUT/PATCH/DELETEに対応。外部REST API（天気、為替、株価、Webhook等）の呼出に使用。ウェブ検索にはwebSearch、ページ読取にはreadUrl、CRM APIにはcrmApi、KB検索にはsearchKnowledgeBaseを使うこと。",
    inputSchema: z.object({
      url: z.string().describe("リクエスト先URL"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .describe("HTTPメソッド（デフォルト: GET）"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("HTTPヘッダー（key-value）"),
      body: z
        .string()
        .optional()
        .describe("リクエストボディ（JSON文字列等）"),
    }),
    execute: async ({ url, method, headers, body }) => {
      const m = method ?? "GET";
      console.log(`[chat] 🌐 httpRequest: ${m} ${url}`);
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          method: m,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RAGBot/1.0)",
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

        if (responseBody.length > 12000) {
          responseBody = responseBody.slice(0, 12000) + "\n...(truncated)";
        }

        console.log(`[chat] 🌐 httpRequest done: ${Date.now() - t0}ms, status=${res.status}`);
        return {
          status: res.status,
          statusText: res.statusText,
          contentType,
          body: responseBody,
        };
      } catch (err) {
        console.error(`[chat] ❌ httpRequest failed:`, err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ---- queryDatabase ----------------------------------------------
  const WRITE_PATTERN =
    /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|VACUUM|CLUSTER|REINDEX|COMMENT|SECURITY|SET\s+ROLE)/i;

  tools.queryDatabase = tool({
    description:
      "PostgreSQLに対して読み取り専用SQLクエリを実行。10秒タイムアウト付きREAD ONLYトランザクションで実行。利用可能テーブル: chat_conversations, chat_messages, chat_files, slide_decks, slide_pages, skills, scheduled_tasks, task_executions 等。データの集計・統計・フィルタリングに使用。ドキュメント内容の検索にはsearchKnowledgeBaseを使うこと。",
    inputSchema: z.object({
      sql: z
        .string()
        .describe("SELECT文のみ。INSERT/UPDATE/DELETE等の書込み操作は拒否されます。"),
    }),
    execute: async ({ sql }) => {
      console.log(`[chat] 🗄️ queryDatabase: ${sql.slice(0, 100)}`);
      const t0 = Date.now();

      if (WRITE_PATTERN.test(sql)) {
        return {
          success: false,
          error: "書込み操作は許可されていません。SELECTクエリのみ実行可能です。",
        };
      }

      const client = await getReadOnlyPool().connect();
      try {
        await client.query("SET statement_timeout = '10s'");
        await client.query("BEGIN READ ONLY");

        const result = await client.query(sql);

        await client.query("COMMIT");

        const rows = result.rows ?? [];
        console.log(`[chat] 🗄️ queryDatabase done: ${Date.now() - t0}ms, ${rows.length} rows`);

        const output = {
          success: true,
          rowCount: rows.length,
          columns: result.fields?.map((f: { name: string }) => f.name) ?? [],
          rows: rows.slice(0, 200),
          truncated: rows.length > 200,
        };

        // Check serialized size
        const serialized = JSON.stringify(output);
        if (serialized.length > 20000) {
          return {
            success: true,
            rowCount: rows.length,
            columns: result.fields?.map((f: { name: string }) => f.name) ?? [],
            rows: rows.slice(0, 50),
            truncated: true,
            note: "出力が大きいため先頭50行のみ表示。",
          };
        }

        return output;
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch { /* ignore */ }
        console.error(`[chat] ❌ queryDatabase failed:`, err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        client.release();
      }
    },
  });

  // NOTE: editFile, listFiles, grepFiles are task-worker only (not in chat — too many tools)

  // loadSkill: registered only when skills exist (prevents LLM hallucination)
  let skillSummaries: SkillSummary[] = [];
  try {
    skillSummaries = await getEnabledSkillSummaries();
    if (skillSummaries.length > 0) {
      tools.loadSkill = loadSkillTool;
      console.log(
        `[chat] 📖 ${skillSummaries.length} skills available: ${skillSummaries.map((s) => s.name).join(", ")}`,
      );
    }
  } catch (e) {
    console.error("[chat] skills fetch failed:", e);
  }

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
                StageName: "提案中",
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

          // 2+3. KB 全検索 + Web 検索を並列実行
          const account = sfData.account as Record<string, unknown> | undefined;
          const opp = sfData.opportunity as Record<string, unknown> | undefined;

          const kbSearchPromise = (async (): Promise<string[]> => {
            try {
              const allKbs = await listKBs();
              const kbsWithDocs = allKbs.filter((k) => k.doc_count > 0);
              const searchQuery = [account?.Name, opp?.Name, account?.Industry, opp?.Description]
                .filter(Boolean)
                .join(" ");
              if (!searchQuery || kbsWithDocs.length === 0) return [];
              const kbResults = await Promise.allSettled(
                kbsWithDocs.map((kb) =>
                  searchOnly(searchQuery, { topK: 5, kb: kb.slug }),
                ),
              );
              const parts: string[] = [];
              for (let i = 0; i < kbResults.length; i++) {
                const r = kbResults[i];
                if (r.status === "fulfilled" && r.value.results?.length > 0) {
                  const kbName = kbsWithDocs[i].name;
                  const texts = r.value.results
                    .map((doc: SearchResult) => doc.content)
                    .filter(Boolean)
                    .join("\n");
                  if (texts) parts.push(`【${kbName}】\n${texts}`);
                }
              }
              console.log(
                `[chat] 📊 fetchAndAnalyze: KB search done, ${parts.length} KBs with results`,
              );
              return parts;
            } catch (e) {
              console.error("[chat] KB search failed:", e);
              return [];
            }
          })();

          const webSearchPromise = (async (): Promise<string[]> => {
            if (!hasTavily) return [];
            try {
              const webQuery = [account?.Name, opp?.Name, account?.Industry]
                .filter(Boolean)
                .join(" ");
              if (!webQuery) return [];
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
              if (!webRes.ok) return [];
              const webData = await webRes.json();
              const webTexts = (webData.results ?? [])
                .map(
                  (r: { title: string; url: string; content: string }) =>
                    `${r.title}: ${r.content}`,
                )
                .join("\n");
              console.log("[chat] 📊 fetchAndAnalyze: Web search done");
              return webTexts ? [`【ウェブ検索】\n${webTexts}`] : [];
            } catch (e) {
              console.error("[chat] Web search failed:", e);
              return [];
            }
          })();

          const [kbParts, webParts] = await Promise.all([kbSearchPromise, webSearchPromise]);

          // 4. additionalContext 結合
          const additionalContext = [...kbParts, ...webParts].join("\n\n");

          // 5. analyzeDeal (with fallback — never block proposal panel)
          let analysisData: Record<string, unknown>;
          try {
            const analyzeRes = await fetch(`${CRM_SERVICE_URL}/deals/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data: sfData,
                additionalContext: additionalContext || undefined,
                model: modelOverride || undefined,
              }),
            });
            const analyzeRaw = await analyzeRes.json();
            if (analyzeRaw.error) {
              console.error(`[chat] ⚠️ fetchAndAnalyze: analyze returned error, using fallback:`, analyzeRaw.error);
              analysisData = {
                winProbability: 50,
                dealHealthScore: 50,
                proposalReadiness: 50,
                keyDrivers: ["分析サービスに一時的な問題が発生しました"],
                riskFactors: [],
                rationale: {
                  customerChallenges: [],
                  serviceRecommendations: [],
                  combinedSolution: "",
                  existingProposalHints: [],
                },
              };
            } else {
              // crm-service returns { analysis: { ...scores, rationale } } — unwrap
              analysisData = (analyzeRaw.analysis ?? analyzeRaw) as Record<string, unknown>;
            }
          } catch (analyzeErr) {
            console.error(`[chat] ⚠️ fetchAndAnalyze: analyze call failed, using fallback:`, analyzeErr);
            analysisData = {
              winProbability: 50,
              dealHealthScore: 50,
              proposalReadiness: 50,
              keyDrivers: ["分析サービスに接続できませんでした"],
              riskFactors: [],
              rationale: {
                customerChallenges: [],
                serviceRecommendations: [],
                combinedSolution: "",
                existingProposalHints: [],
              },
            };
          }
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
          const session = await getSession(sessionKey);
          if (!session) {
            return { error: "セッションが見つかりません" };
          }
          const res = await fetch(`${CRM_SERVICE_URL}/deals/revise-rationale`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentAnalysis: session.analysis,
              feedback,
              additionalContext: session.additionalContext || undefined,
              model: modelOverride || undefined,
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

  // Image generation tool — uses native Gemini generateContent + responseModalities
  // Sends user's original prompt + attached images together to Nano Banana
  if (useGemini) {
    // Build model messages from the last user message (text + images)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const lastUserParts = lastUserMsg?.parts ?? [];
    // Convert last user message to model format and resolve file URLs → binary
    const lastUserModelMessages = lastUserMsg
      ? await convertToModelMessages([
          { ...lastUserMsg, role: "user" } as UIMessage,
        ])
      : [];
    if (lastUserModelMessages.length > 0) {
      await resolveServerFiles(lastUserModelMessages);
    }

    tools.generateImage = tool({
      description:
        "画像を生成・編集します。ユーザーが「描いて」「画像を作って」「イラスト」「この画像を編集して」等を依頼した場合に即座に呼び出す。プロンプトの書き換えや翻訳は不要 — ユーザーの原文がそのまま画像モデルに渡される。",
      inputSchema: z.object({
        prompt: z.string().describe("ユーザーの原文をそのまま渡す（書き換え・翻訳不要）"),
        aspectRatio: z
          .enum(["1:1", "3:4", "4:3", "9:16", "16:9"])
          .optional()
          .describe("画像のアスペクト比（デフォルト 1:1）"),
      }),
      execute: async ({ prompt: toolPrompt }) => {
        // Use original user message (with images) for best Nano Banana quality
        const userText = lastUserParts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        const imagePrompt = userText || toolPrompt;
        console.log(
          `[chat] 🎨 generateImage (native): "${imagePrompt.slice(0, 50)}..."`,
        );
        const t0 = Date.now();
        try {
          const imageModel = getChatModel("gemini-3.1-flash-image-preview");
          const genOpts = {
            providerOptions: {
              [providerOptionsKey]: {
                responseModalities: ["TEXT", "IMAGE"],
                personGeneration: "allow_adult",
              },
            },
          };
          const result = lastUserModelMessages.length > 0
            ? await generateText({
                model: imageModel,
                messages: lastUserModelMessages,
                ...genOpts,
              })
            : await generateText({
                model: imageModel,
                prompt: imagePrompt,
                ...genOpts,
              });
          const savedUrls: string[] = [];
          for (const file of (result.files ?? []).slice(0, 1)) {
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
            savedUrls.push(`/api/files/${id}`);
          }
          console.log(
            `[chat] 🎨 generateImage done: ${Date.now() - t0}ms, ${savedUrls.length} images`,
          );
          return {
            success: true,
            images: savedUrls.map((url, i) => ({
              url,
              mediaType: (result.files ?? [])[i]?.mediaType ?? "image/png",
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

  // Scheduler tools (only when TASK_WORKER_URL is configured)
  if (hasScheduler) {
    const { createTask, listTasks, updateTask, deleteTask } = await import("@/lib/scheduler-db");

    tools.createScheduledTask = tool({
      description:
        "定時タスク（スケジュールジョブ）を新規作成する。ユーザーが「毎日○時に△△して」「定期的に××を監視」「自動で□□レポートを作成」等、繰り返し実行したいタスクを依頼した時に使用する。" +
        "使わない場面: 今すぐ1回だけ実行してほしい依頼（直接回答する）、既存タスクの変更（updateScheduledTaskを使う）、タスク確認（listScheduledTasksを使う）。",
      inputSchema: z.object({
        name: z.string().describe("タスクの短い名前（一覧表示用）"),
        prompt: z.string().describe("タスク実行時にAIに渡すプロンプト。具体的で明確に書く。タスク実行AIはKB検索・Web検索・CRM API・コード実行ツールを使える"),
        cron_expr: z
          .string()
          .describe(
            "5フィールドCron式。分 時 日 月 曜日。ユーザーのローカル時間で指定。例: '0 9 * * *'=毎日9時, '0 9 * * 1'=毎週月曜9時, '0 */6 * * *'=6時間毎, '30 8 * * 1-5'=平日8:30",
          ),
        timezone: z.string().optional().describe("IANAタイムゾーン。省略時はAsia/Tokyo。例: 'Asia/Tokyo', 'America/New_York'"),
        kb_slug: z.string().optional().describe("タスクが参照するナレッジベースのslug。KB検索が不要なら省略"),
        model: z.string().optional().describe("使用するGeminiモデル名。省略時はデフォルト(gemini-3-flash-preview)。例: 'gemini-2.5-flash', 'gemini-2.5-pro'"),
        description: z.string().optional().describe("タスクの目的や背景の説明（管理画面表示用）"),
      }),
      execute: async (args) => {
        console.log(`[chat] 📅 createScheduledTask: ${args.name}`);
        try {
          const id = await createTask({
            name: args.name,
            prompt: args.prompt,
            cron_expr: args.cron_expr,
            timezone: args.timezone || "Asia/Tokyo",
            kb_slug: args.kb_slug,
            model: args.model,
            description: args.description,
          });
          return { success: true, id, name: args.name, cron_expr: args.cron_expr };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.listScheduledTasks = tool({
      description:
        "登録済みの定時タスク一覧を取得する。ユーザーが「今どんなタスクがある？」「スケジュール確認」「定時タスクの状態を教えて」と聞いた時に使用。" +
        "使わない場面: 新規タスク作成（createScheduledTask）、タスク変更・削除（update/deleteScheduledTask）。",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const tasks = await listTasks();
          return tasks.map((t) => ({
            id: t.id,
            name: t.name,
            cron_expr: t.cron_expr,
            enabled: t.enabled,
            next_run_at: t.next_run_at,
            last_run_at: t.last_run_at,
          }));
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.updateScheduledTask = tool({
      description:
        "既存の定時タスクを更新する。「タスクを無効にして」「実行時間を変えて」「プロンプトを修正して」等の変更依頼時に使用。enabled:falseで一時停止、trueで再開。" +
        "使わない場面: 新規作成（createScheduledTask）、完全削除（deleteScheduledTask）。必ず先にlistScheduledTasksでIDを確認してから呼ぶ。",
      inputSchema: z.object({
        id: z.number().describe("更新対象のタスクID（listScheduledTasksで事前確認）"),
        name: z.string().optional().describe("新しいタスク名"),
        prompt: z.string().optional().describe("新しいプロンプト"),
        cron_expr: z.string().optional().describe("新しいCron式"),
        timezone: z.string().optional().describe("IANAタイムゾーン。例: 'Asia/Tokyo'"),
        enabled: z.boolean().optional().describe("true=有効, false=一時停止"),
      }),
      execute: async (args) => {
        console.log(`[chat] 📅 updateScheduledTask: id=${args.id}`);
        try {
          const { id, ...data } = args;
          await updateTask(id, data);
          return { success: true, id };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.deleteScheduledTask = tool({
      description:
        "定時タスクを完全に削除する（実行履歴も消える）。ユーザーが明確に「タスクを削除して」「もう不要」と言った時のみ使用。" +
        "使わない場面: 一時停止したいだけ（updateScheduledTaskでenabled:falseにする）。削除は取り消せないので、ユーザーの意図を確認してから実行する。",
      inputSchema: z.object({
        id: z.number().describe("削除対象のタスクID（listScheduledTasksで事前確認）"),
      }),
      execute: async ({ id }) => {
        console.log(`[chat] 📅 deleteScheduledTask: id=${id}`);
        try {
          await deleteTask(id);
          return { success: true, id };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    tools.runScheduledTask = tool({
      description:
        "定時タスクを今すぐ手動実行する（テスト実行）。ユーザーが「今すぐ実行」「テストしたい」「試しに動かして」と言った時に使用。" +
        "使わない場面: スケジュール変更（updateScheduledTask）、タスク確認（listScheduledTasks）。" +
        "実行はキューに投入され非同期で処理される。結果は通知またはスケジューラ詳細画面で確認できる。",
      inputSchema: z.object({
        id: z.number().describe("実行対象のタスクID（listScheduledTasksで事前確認）"),
      }),
      execute: async ({ id }) => {
        console.log(`[chat] 📅 runScheduledTask: id=${id}`);
        try {
          const { getTask, createExecution, updateExecution } = await import("@/lib/scheduler-db");
          const { enqueueTask } = await import("@/lib/scheduler-queue");
          const task = await getTask(id);
          if (!task) return { success: false, error: `タスクID ${id} が見つかりません` };
          const executionId = await createExecution(id);
          await updateExecution(executionId, { status: "queued" });
          await enqueueTask({
            taskId: id,
            executionId,
            prompt: task.prompt,
            kbSlug: task.kb_slug,
            allowedTools: task.allowed_tools ?? [],
            maxToolCalls: task.max_tool_calls ?? 25,
            timeoutSeconds: task.timeout_sec ?? 600,
            model: task.model,
            notifyTo: task.notify_to,
            notifyFrom: task.notify_from,
          });
          return { success: true, taskId: id, executionId, taskName: task.name };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }

  // reviseSlides tool: precise slide editing from chat
  if (activeDeckId) {
    tools.reviseSlides = tool({
      description:
        "提案書スライドを編集します。テキスト置換は update、大幅な変更は rewrite を使用。",
      inputSchema: z.object({
        operations: z.array(
          z.object({
            type: z
              .enum(["update", "rewrite", "delete", "insert", "reorder"])
              .describe("操作タイプ"),
            slideIndex: z.number().describe("対象スライドのインデックス（0始まり）"),
            oldStr: z.string().optional().describe("update: 置換前テキスト"),
            newStr: z.string().optional().describe("update: 置換後テキスト"),
            instruction: z
              .string()
              .optional()
              .describe("rewrite/insert: 生成指示"),
            targetIndex: z.number().optional().describe("reorder: 移動先インデックス"),
          }),
        ),
      }),
      execute: async ({ operations }) => {
        console.log(
          `[chat] 📝 reviseSlides: deckId=${activeDeckId}, ${operations.length} operations`,
        );
        const t0 = Date.now();
        try {
          await ensureSlideTables();
          const deck = await getSlideDeckDetail(activeDeckId!);
          if (!deck) return { error: "Deck not found" };

          const modified: number[] = [];
          let version = deck.current_version ?? 1;

          for (const op of operations) {
            const slide = deck.slides[op.slideIndex];
            if (!slide && op.type !== "insert") {
              continue;
            }

            switch (op.type) {
              case "update": {
                if (!op.oldStr || !op.newStr || !slide) break;
                let html = slide.html;
                if (html.includes(op.oldStr)) {
                  html = html.replace(op.oldStr, op.newStr);
                } else {
                  // Fallback: strip HTML tags and try matching in text content
                  const textOnly = html.replace(/<[^>]+>/g, "");
                  if (textOnly.includes(op.oldStr)) {
                    // Find the tag-enclosed text and replace
                    const escaped = op.oldStr.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&",
                    );
                    const re = new RegExp(
                      escaped.split("").join("[^<]*(?:<[^>]*>[^<]*)*"),
                    );
                    html = html.replace(re, op.newStr);
                  } else {
                    continue; // Could not find text
                  }
                }
                version = await updateSlideAndVersion(
                  activeDeckId!,
                  op.slideIndex,
                  html,
                  "update",
                  { oldStr: op.oldStr, newStr: op.newStr },
                );
                deck.slides[op.slideIndex].html = html;
                modified.push(op.slideIndex);
                break;
              }
              case "rewrite": {
                if (!op.instruction || !slide) break;
                const slideModel = getChatModel(modelOverride);
                const rewriteResult = await generateText({
                  model: slideModel,
                  system: SLIDE_HTML_SYSTEM_PROMPT,
                  prompt: `現在のHTMLスライドを以下の指示に従ってリライトしてください。

【現在のHTML】
${slide.html}

【指示】
${op.instruction}

<div>タグ1つだけを出力。`,
                  maxOutputTokens: 4096,
                });
                const newHtml = extractHtmlFromResponse(rewriteResult.text);
                if (newHtml) {
                  version = await updateSlideAndVersion(
                    activeDeckId!,
                    op.slideIndex,
                    newHtml,
                    "rewrite",
                    { instruction: op.instruction },
                  );
                  deck.slides[op.slideIndex].html = newHtml;
                  modified.push(op.slideIndex);
                }
                break;
              }
              case "delete": {
                // Mark as deleted by removing from slides array (reindex happens in DB)
                // For now we just clear the HTML — full delete+reindex is complex
                if (!slide) break;
                version = await updateSlideAndVersion(
                  activeDeckId!,
                  op.slideIndex,
                  "",
                  "delete",
                  {},
                );
                modified.push(op.slideIndex);
                break;
              }
              case "insert": {
                if (!op.instruction) break;
                const slideModel = getChatModel(modelOverride);
                const insertResult = await generateText({
                  model: slideModel,
                  system: SLIDE_HTML_SYSTEM_PROMPT,
                  prompt: `以下の指示に基づいて新しいプレゼンスライド1枚分のHTMLを生成してください。

【デッキタイトル】${deck.title}
【指示】${op.instruction}

<div>タグ1つだけを出力。width:1280px, height:720px。`,
                  maxOutputTokens: 4096,
                });
                const insertHtml = extractHtmlFromResponse(insertResult.text);
                if (insertHtml) {
                  // For simplicity, update the existing slide at the index (or last slide)
                  const targetIdx = Math.min(op.slideIndex, deck.slides.length - 1);
                  version = await updateSlideAndVersion(
                    activeDeckId!,
                    targetIdx,
                    insertHtml,
                    "insert",
                    { instruction: op.instruction },
                  );
                  modified.push(targetIdx);
                }
                break;
              }
              case "reorder": {
                // Simple swap: not fully implemented, just note it
                modified.push(op.slideIndex);
                break;
              }
            }
          }

          console.log(
            `[chat] 📝 reviseSlides done: ${Date.now() - t0}ms, modified=[${modified}], version=${version}`,
          );
          return {
            success: true,
            modified,
            version,
            deckId: activeDeckId,
          };
        } catch (err) {
          console.error(`[chat] ❌ reviseSlides failed:`, err);
          return { error: err instanceof Error ? err.message : String(err) };
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

    // === TEXT MODEL PATH ===
    let firstTokenTime = 0;

    let systemPrompt = buildSystemPrompt(
      !!kb || autoDiscovery,
      clientTime,
      autoDiscovery,
    );

    // Inject widget guidelines
    systemPrompt += "\n\n" + WIDGET_SYSTEM_PROMPT;

    // Inject slide context when a deck is active
    if (activeDeckId && slidesSummary) {
      systemPrompt += `\n\n## 現在の提案書スライド (deckId: ${activeDeckId})\n${slidesSummary}\nスライド編集は reviseSlides ツールを使用してください。テキスト変更は type:"update" + oldStr/newStr、大幅な変更は type:"rewrite" + instruction。`;
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
      callOptionsSchema: skillCallOptionsSchema,
      prepareCall: ({ options, ...settings }) => ({
        ...settings,
        instructions:
          settings.instructions + buildSkillsPrompt(options.skills),
        experimental_context: { skills: options.skills },
      }),
      ...(thinking && useGemini
        ? {
            providerOptions: {
              [providerOptionsKey]: {
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
      options: { skills: skillSummaries },
      messages: modelMessages,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: new Intl.Segmenter("ja", { granularity: "word" }),
      }),
    });

    // Ensure agent runs to completion even if client disconnects
    void result.consumeStream({
      onError: (e) => console.error("[chat] consumeStream error:", e),
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        if (!firstTokenTime) firstTokenTime = Date.now();
        t.stream = Date.now() - t.start;
        const usage = await result.totalUsage.catch(() => null);
        console.log(
          `[chat] ✅ done: total=${t.stream}ms | prefill=${firstTokenTime ? firstTokenTime - t1 : "?"}ms gen=${firstTokenTime ? Date.now() - firstTokenTime : "?"}ms | tokens=${(usage as Record<string, unknown>)?.completionTokens ?? (usage as Record<string, unknown>)?.outputTokens ?? "?"}`,
        );
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
