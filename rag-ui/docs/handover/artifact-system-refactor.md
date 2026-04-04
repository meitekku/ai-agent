# Artifact System Refactor — 完全記録

**日付**: 2026-04-04
**ブランチ**: `feat/artifact-system`
**旧コードバックアップ**: `backup/pre-artifact-refactor`（`origin` に push 済み、commit `fd45711`）
**規模**: 58 ファイル変更、+444 行、-18,326 行

---

## 1. 旧システム: 何があったか

### 1.1 SlidePanel（スライド生成面板）

ユーザーがチャットで「スライドを作って」と依頼すると、4 種類のスライドビューアから選択してスライドを生成する機能。

**4 つのスライドモード:**

| モード | コンポーネント | 特徴 |
|--------|---------------|------|
| HTML スライド | `HtmlSlideViewer`（2,529 行） | スタイルオプション、テンプレート、ドラッグ編集、DB 保存/履歴 |
| ビジュアルスライド | `VisualSlideViewer`（810 行） | 7 種風格プリセット、outline→HTML、contentEditable |
| スライドスタジオ | `SlideStudio`（2,056 行） | 構造化編集（bullets/表/チャート/Mermaid）、AI Refine |
| 簡易スライド | `SlideViewer` | シンプルなプレビュー + PPTX |

**動作フロー:**
```
1. LLM が generateSlides tool を呼出 → {triggered: true, topic, content} を返すだけ
2. chat-page.tsx が tool result を検出 → SlideSetupWizard を開く
3. ユーザーがスタイル（産業/職種/年代/色/フォント）を選択
4. SlidePanel が開く → 5 段階のフェーズ:
   a. planning: POST /api/slides/htmlslide/plan → マークダウン計画生成
   b. plan_ready: ユーザーが計画を確認
   c. generating: POST /api/slides/htmlslide/render × N 枚（並列 CONCURRENCY=3）
   d. done: スライドビューア表示（ドラッグ編集、フォント変更、ズーム）
   e. error: エラー表示
5. 自動保存 → slide_decks + slide_pages テーブル
6. バージョン管理 → slide_page_versions テーブル
7. エクスポート: html2canvas → PPTX(pptxgenjs) / PDF(jsPDF) / HTML
```

**関連ファイル（17 個）:**
- `components/slide-panel/` ディレクトリ: index.tsx（917 行）, panel-header.tsx（357 行）, phase-planning/generating/viewer/error.tsx, use-slide-editing.ts（569 行、ドラッグ&リサイズ）, use-slide-export.ts, use-slide-versions.ts, utils.ts（324 行）, constants.ts, types.ts, html-presentation.ts
- `components/slide-setup-wizard.tsx`（432 行）: 3 ステップウィザード
- `components/style-options-panel.tsx`（581 行）: 産業/職種/年代/色/フォント選択 UI
- `components/template-manager.tsx`（322 行）: テンプレート CRUD モーダル
- `components/fullscreen-presenter.tsx`（158 行）: プレゼンテーションモード

**DB テーブル（4 個）:**
- `slide_decks`: デッキメタデータ（title, question, answer, plan_md, style_options, current_version, conversation_id）
- `slide_pages`: 個別スライド（deck_id FK CASCADE, slide_index, title, html, plan_text）
- `slide_page_versions`: バージョン履歴（deck_id, slide_index, version, operation, operation_detail JSONB）
- `slide_templates`: テンプレート（name, position, html, header_color, footer_color）

**専用 API ルート（11 個）:**
- `/api/slides/htmlslide/plan`, `/api/slides/htmlslide/render`
- `/api/slides/plan`, `/api/slides/render`, `/api/slides/generate`, `/api/slides/refine`
- `/api/slides/visual/outline`, `/api/slides/visual/renderhtml`
- `/api/slides/pptx`, `/api/slides/pdf`, `/api/slides/image`
- `/api/history/slides/` (一覧/詳細/バージョン/複製)
- `/api/templates/slides/` (CRUD)

**Lib ファイル（8 個）:**
- `lib/slide-db.ts`（569 行）: PostgreSQL CRUD + バージョン管理
- `lib/slide-prompts.ts`（1,307 行）: LLM プロンプト + HTML バリデーション + スタイルプリセット
- `lib/slide-panel-store.ts`: Zustand store（cachedSlides, conversationDeckId, refreshToken, per-conversation save/restore）
- `lib/slide-store.ts`: 簡易スライド状態
- `lib/slide-api.ts`: フロントエンド API クライアント
- `lib/slide-types.ts`, `lib/slide-provider.ts`, `lib/slide-render-sanity.ts`

### 1.2 ProposalPanel（CRM 提案書面板）

CRM（Salesforce/Kintone）の商談データを取得・分析し、提案書スライドを自動生成する機能。

**動作フロー:**
```
1. ユーザー「商談を分析して」→ LLM が listDeals tool → 商談一覧表示
2. ユーザーが選択 → LLM が fetchDealData tool → CRM データ取得
   - storeSession(data) でセッションに保存 → dataKey 返却
3. LLM が analyzeDeal tool（dataKey + additionalContext）
   - getSession(dataKey) → generateObject() で AI 分析
   - updateSessionFull() でセッション更新
   - {sessionKey} を返却
4. chat-page.tsx が sessionKey を検出 → ProposalPanel を開く
5. ProposalPanel 3 段階フロー:
   a. Phase 1 (analysis): 分析スコア表示（受注確率/健全度/活動スコア）+ 成功要因 + リスク
   b. Phase 2 (templateCheck): GET /api/crm/templates → マッチしたテンプレート確認
   c. Phase 3 (styleSetup): StyleOptionsPanel でスタイル設定（業種自動推定）
6. 「スライド生成」ボタン → buildProposalContent() + buildTemplateInstructions()
   → ProposalPanel を閉じ → SlidePanel を開く → スライド生成
```

**セッション管理（proposal-session.ts）:**
- `storeSession()`: nanoid(12) キー生成 → PostgreSQL `proposal_sessions` テーブル + インメモリ Map
- `getSession()`: メモリ優先、miss 時 DB fallback
- `updateSessionAnalysis()`: メモリ + DB 両方更新
- `updateSessionUI()`: phase + styleOptions を fire-and-forget で DB 永続化

**関連ファイル:**
- `components/proposal-panel.tsx`（808 行）
- `lib/proposal-panel-store.ts`: Zustand store（sessionKey, phase, data, analysis, styleOptions）
- `lib/proposal-session.ts`（174 行）: PostgreSQL + インメモリセッションキャッシュ
- `lib/analysis-schema.ts`（254 行）: DealAnalysisSchema Zod 定義 + buildAnalysisPrompt()
- `app/api/crm/proposal-session/[key]/route.ts`: GET/PATCH セッション
- `app/api/crm/generate-pptx/route.ts`: sessionKey → PPTX 生成プロキシ

### 1.3 reviseSlides（チャットからスライド編集）

SlidePanel 生成後、ユーザーがチャットで「タイトルを変えて」等の指示 → LLM が reviseSlides tool でスライドを直接編集。

**5 つの操作:**
- `update`: oldStr → newStr テキスト置換（LLM 呼出なし）
- `rewrite`: instruction → generateText() → 新 HTML（LLM 呼出あり）
- `delete`: HTML クリア
- `insert`: instruction → 新スライド生成
- `reorder`: インデックス交換

`activeDeckId` がリクエスト body にある場合のみ tool 有効化。操作後 `store.triggerRefresh()` → SlidePanel が DB から再読み込み。

---

## 2. 何が問題だったか

### 2.1 アーキテクチャの根本問題: Agent Loop からの脱離

**全ての面板が agent loop の外で独立動作していた。**

```
❌ 旧アーキテクチャ:
LLM → tool({triggered: true}) → 終了  ← ここで agent の関与が切れる
                                    ↓
                              chat-page.tsx が検出
                                    ↓
                              面板が開く → 面板が独自に API を叩く
                                    ↓
                              面板内で生成/編集/保存（LLM は関知しない）
```

これの結果:
- **LLM は面板の中身を見ることも修正することもできない** — ユーザーが「色を変えて」と言っても、LLM は面板に何が表示されているか分からない
- **流程がハードコード** — ProposalPanel の「分析 → テンプレート → スタイル → スライド生成」は固定。ユーザーが「テンプレート不要、直接生成して」と言っても飛ばせない
- **tool は信号だけ返して実質的に何もしていない** — `generateSlides` は `{triggered: true}` を返すだけ。実際の生成は面板が行う

### 2.2 コードの肥大化

18,000 行のコードで実現していたことは「LLM が自分で HTML を生成してサイドパネルに表示する」だけ。以下の全てが不要な複雑さ:

- **SlideSetupWizard（432 行）**: ユーザーにスタイルを選ばせる 3 ステップ UI → agent が文脈から判断すればいい
- **5 段階 phase 管理**: planning → plan_ready → generating → done → error → loading → agent が段階的に生成すればいい
- **4 つのスライドモード（6,000 行）**: HTML/Visual/Studio/Simple → agent が最適な形式を選べばいい
- **style-options-panel（581 行）**: 産業/職種/年代/色/フォント選択 → agent がプロンプトから推定すればいい
- **slide-prompts.ts（1,307 行）**: 巨大なプロンプトファイル → system prompt に数行追加すれば同等
- **専用セッション管理**: インメモリ Map + PostgreSQL → 会話の context window に入れれば不要

### 2.3 状態管理の分裂

3 つの独立した状態管理が並立:
- `useSlidePanelStore`: open, question, answer, instructions, styleOptions, deckId, cachedSlides, conversationDeckId, refreshToken, savedStates (per-conversation)
- `useProposalPanelStore`: isOpen, sessionKey, phase, data, analysis, styleOptions
- `proposal-session.ts`: カスタム Map + PostgreSQL キャッシュ（fire-and-forget persistUI）

面板間の遷移（ProposalPanel → SlidePanel）は callback props のチェーンで実現。

### 2.4 CRM ツールの問題

- `fetchDealData` が `storeSession()` でセッションに保存 → `analyzeDeal` が `getSession(dataKey)` で読み出し。この間接性は agent の context window を使えば不要
- `analyzeDeal` は `sessionKey` を返すことで面板開放をトリガー。分析結果自体は agent に返らない設計
- `reviseRationale` は `getSession()` → CRM service → `updateSessionAnalysis()` → agent に返す、セッションを経由する間接パス

---

## 3. 調査: 各社の実装

リファクタリング前に Claude Artifacts / Gemini Canvas / Vercel AI Chatbot の実装を詳細調査した。

### 3.1 Claude Artifacts
- tool_use で `artifact` ツール呼出（command: create/update/rewrite）
- `update` は `old_str`/`new_str` で差分のみ伝送（"Replace Is All You Need" — 3-4x 高速）
- content は tool input の JSON delta として流式到達
- 上下文: 会話履歴に content が残るので LLM は記憶で見る（ユーザー編集は反映されない）

### 3.2 Gemini Canvas
- 自動判断で Canvas 開放（tool call ではない）
- ユーザーがインライン編集可能（直接タイプ）
- 毎ターン Canvas 全文を context に注入（ユーザー編集も反映）
- 全文書き換えが主（差分更新は選択テキスト + プロンプトのみ）

### 3.3 Vercel AI Chatbot (`vercel/chatbot`)
- `createDocument` / `updateDocument` / `editDocument` の 3 ツール
- `createUIMessageStream` の `writer` を tools に渡し、`data-codeDelta` 等のカスタムイベントで流式推送
- tool 内部で二次 `streamText()` 呼出 → token ごとに writer.write()
- SWR で artifact 状態管理（Zustand ではない）
- バージョン: `(id, createdAt)` 複合主キー、毎回 INSERT

### 3.4 採用方針

各家の長所を組み合わせ:
- **Claude**: create/update/rewrite 3 コマンド + old_str/new_str 差分更新
- **Vercel**: `createUIMessageStream` + `writer.write()` で流式推送
- **Gemini**: 毎ターンの artifact content 上下文注入
- **独自**: AI SDK v6 の `input-streaming` 状態を監視し、追加 LLM コスト 0 で面板にリアルタイムプレビュー

---

## 4. 何をリファクタリングしたか

### 4.1 ToolLoopAgent → streamText + createUIMessageStream

`app/api/chat/route.ts` のストリーミングアーキテクチャを変更。`ToolLoopAgent` は高レベル封装で stream に custom data を注入する手段がなかった。`streamText` + `stopWhen: stepCountIs(15)` は同じ tool loop 動作だが、`createUIMessageStream` の `writer` を tool に渡せる。

```typescript
// Before
const agent = new ToolLoopAgent({ model, tools, stopWhen: stepCountIs(15) });
const result = await agent.stream({ messages });
return result.toUIMessageStreamResponse({ sendReasoning: true });

// After
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    if (chatId) tools.artifact = createArtifactTool({ writer, conversationId: chatId });
    const result = streamText({ model, system: prompt, messages, tools, stopWhen: stepCountIs(15) });
    writer.merge(result.toUIMessageStream({ sendReasoning: true }));
    await result.text;
  },
  onFinish: async ({ responseMessage }) => { /* DB 永続化 */ },
});
return createUIMessageStreamResponse({ stream });
```

### 4.2 Artifact システム新設

**DB スキーマ** (`lib/artifact-db.ts`):
```sql
artifacts (id TEXT PK, conversation_id FK CASCADE, kind, title, current_version, timestamps)
artifact_versions (artifact_id + version 複合PK, content TEXT, command, description, created_at)
```

**Artifact ツール** (`lib/artifact-tool.ts`):
- `create`: nanoid(12) ID 生成 → DB 書込 → `writer.write({ type: "data-artifact", data: { event: "create", ... } })`
- `update`: DB から現 content 読取 → `content.replace(oldStr, newStr)` → 新バージョン → writer 推送
- `rewrite`: 新 content で新バージョン → writer 推送
- update/rewrite は `Promise.all` で version 作成と meta 更新を並列実行

**クライアント** (`components/chat-page.tsx`):
- `useChat({ onData })`: `data-artifact` イベントを検出 → `useArtifactStore.openArtifact()` / `.updateArtifact()`
- streaming 検出: `useEffect` が messages を監視、artifact tool が `input-streaming` 状態の時に `setStreaming()` で部分 content を面板にリアルタイム表示
- 会話復元: `useEffect` が `initialConvId` 変更時に `/api/artifacts?conversationId=` から artifact 復元（AbortController 付き）

**サイドパネル** (`components/artifact-panel.tsx`):
- `next/dynamic` で遅延読込（Streamdown/WidgetRenderer をメインバンドルから除外）
- 渲染分岐: html → WidgetRenderer (sandbox iframe, isStreaming 対応), code → Streamdown 構文ハイライト (language タグ対応), markdown/text → Streamdown
- ヘッダ: タイトル + language バッジ + streaming パルス + バージョン切替 (v1/v2) + コピー + ダウンロード + 閉じる
- ダウンロード: kind + language に応じた拡張子（.html/.py/.ts/.md/.txt）

**チャットメッセージ** (`components/chat-message.tsx`):
- `ArtifactCard`: artifact tool 完了時にクリック可能なカード表示（タイトル + kind + バージョン）
- クリック → store に既にあれば即表示、なければ `/api/artifacts/[id]` から取得して開放

### 4.3 上下文注入

`app/api/chat/route.ts` — 毎ターンの system prompt 構築時:
```typescript
const artifact = await getArtifactByConversation(chatId);
if (artifact) {
  const content = await getCurrentContent(artifact.id); // JOIN 1 回で取得
  systemPrompt += `## 現在のアーティファクト\n${content}\n修正は update/rewrite で。`;
}
```
15,000 字超過時は切り詰め + LLM に「rewrite を使え」と警告。

### 4.4 CRM Tools 簡素化

| ツール | Before | After |
|--------|--------|-------|
| `fetchDealData` | `storeSession(data)` → `{dataKey}` 返却 | データ直接返却 `{data}`（セッション不使用） |
| `analyzeDeal` | 入力 `dataKey` → `getSession()` → 分析 → `updateSessionFull()` → `{sessionKey}` で面板開放 | 入力 `sessionData` (直接) → 分析 → `{analysis, data}` 返却。agent が artifact create で提案書生成 |
| `reviseRationale` | 入力 `sessionKey` → `getSession()` → CRM service → `updateSessionAnalysis()` | 入力 `currentAnalysis` (直接) → CRM service → 結果返却。agent が artifact update/rewrite |

### 4.5 品質改善

- `getCurrentContent`: N+1 クエリ → 1 回の JOIN に最適化
- API ルート: try/catch + parseInt バリデーション + Promise.all 並列化
- 会話切替: AbortController で race condition 防止
- ArtifactCard: store 確認 → 不要な API 呼出回避
- `maxOutputTokens`: 8192 → 32768（大規模 HTML 生成対応）
- 分步生成: system prompt に段階的構築ガイダンス追加

---

## 5. 現在の状態

### 5.1 動作確認済み

| テスト | 結果 |
|--------|------|
| HTML artifact（Chart.js ダッシュボード） | ✅ 流式渲染、streaming パルス表示 |
| Code artifact（Python/TypeScript + 構文ハイライト） | ✅ language バッジ表示 |
| Markdown artifact（見出し/表/コードブロック） | ✅ Streamdown 渲染 |
| Text artifact | ✅ Streamdown Markdown 渲染 |
| Artifact update（同一会話で反復修正） | ✅ バージョン自動インクリメント |
| バージョン切替（v1 ↔ v2 ↔ v3） | ✅ API から内容取得 |
| 会話復元（別ページ → 戻る → 面板自動復元） | ✅ DB から復元 |
| Artifact カード（チャット内クリックで再開） | ✅ store 優先 → API fallback |
| コピー / ダウンロード | ✅ |
| Docker prod build（OrbStack） | ✅ 全サービス正常起動 |
| DB 完整性（artifacts + artifact_versions） | ✅ |

### 5.2 削除されたファイル（53 個）

コンポーネント 22 個、Lib 13 個、API ルート 18 ディレクトリ。全て `backup/pre-artifact-refactor` ブランチに保存。

### 5.3 新規ファイル（8 個）

`lib/artifact-db.ts`, `lib/artifact-tool.ts`, `lib/artifact-store.ts`, `components/artifact-panel.tsx`, `app/api/artifacts/route.ts`, `app/api/artifacts/[id]/route.ts`, `app/api/artifacts/[id]/versions/[version]/route.ts`

### 5.4 DB

旧テーブル（`slide_decks`, `slide_pages`, `slide_page_versions`, `slide_templates`, `proposal_sessions`）はコードから参照されなくなったが、データは保持。DROP は行っていない。

---

## 6. 旧機能の再実装計画

旧 SlidePanel / ProposalPanel で提供していた具体的な機能を、artifact システム上でどう再現するか。

### 6.1 提案書 HTML 生成

**以前の内容（ProposalPanel → SlidePanel が生成していたもの）:**
- カバースライド: 会社名、案件名、日付、自社ロゴ
- 目次スライド
- 課題分析: 顧客の課題一覧、業界動向
- KPI スコア: 受注確率、健全度、提案準備度（ゲージ/レーダーチャート）
- ソリューション提案: 推奨サービス、組み合わせ提案、ROI 試算
- 成功事例: 類似案件の事例紹介
- 見積もり: サービス別費用、合計
- まとめ: 推奨アクション、タイムライン

**再実装方法:**
1. **提案書 Skill を作成** — `skills` テーブルに提案書生成用の system prompt を登録。提案書の HTML テンプレート構造（セクション定義、Chart.js グラフテンプレート、CSS スタイル）を含む
2. **CRM フロー** — agent が `fetchDealData` → KB/Web 検索 → `analyzeDeal` → 分析結果を元に `artifact create`（kind: html）で提案書 HTML を生成。Skill の指示に従って構造化
3. **分步生成** — 骨格 + カバー → `update` で課題分析追加 → `update` で KPI チャート追加 → `update` でソリューション追加 → `update` で見積もり追加
4. **show-widget との使い分け** — KPI スコア（受注確率ゲージ等）は分析直後にチャット内 show-widget でインライン表示。提案書全体は artifact で右パネル

### 6.2 KPI 可視化（show-widget で再現）

**以前の内容（analyzeDeal 後に ProposalPanel Phase 1 で表示していたもの）:**
- 受注確率ゲージチャート（0-100%）
- 商談健全度スコア
- 提案準備度スコア
- 活動スコア
- エンゲージメントレベル
- 主要推進要因リスト
- リスク要因リスト
- 推奨アクションリスト
- 3 シナリオ分析（楽観/基本/悲観: 確率、予想売上、タイムライン、条件）

**再実装方法:**
- `analyzeDeal` 完了後、agent が分析結果を show-widget で可視化（チャット内インライン）
- HTML + Chart.js で受注確率ゲージ、レーダーチャート、比較カード等
- system prompt の artifact ガイドに「KPI は show-widget、提案書全体は artifact」と明記済み

### 6.3 スタイルオプション

**以前の内容（StyleOptionsPanel で選択していたもの）:**
- 産業プリセット（IT/製造/金融/医療/不動産/小売/教育/建設）
- 職種（経営/営業/技術/人事/マーケ）
- 対象年代
- カラーパレット（8 種）
- フォント（4 種）
- カスタム指示

**再実装方法:**
- agent が会話の文脈（業界、顧客属性）から自動推定してスタイルを決定
- ユーザーが「もっとフォーマルに」「青系で」と指示 → agent が artifact update/rewrite
- 提案書 Skill に各業界のデフォルトスタイル定義を含める

### 6.4 エクスポート（PPTX / PDF）

**以前の内容:**
- html2canvas で各スライドを PNG キャプチャ
- pptxgenjs で PPTX 生成（Mode A: 画像、Mode B: 構造化）
- jsPDF で PDF 生成

**再実装方法:**
- artifact-panel.tsx にエクスポートボタン追加
- HTML artifact の場合: iframe 内を html2canvas → jsPDF（PDF）/ pptxgenjs（PPTX）
- 旧 `use-slide-export.ts` のロジックは `backup/pre-artifact-refactor` に保存済み、必要な部分を移植

### 6.5 スライド編集

**以前の内容（use-slide-editing.ts、569 行）:**
- iframe 内 contentEditable でテキスト直接編集
- ドラッグ移動（Shift+click マルチセレクト）
- 8 方向リサイズハンドル
- コピー/削除ボタン
- フォントファミリー/サイズ変更

**再実装方法:**
- V1: チャットで指示 → agent が artifact update/rewrite（現状で動作）
- V2: artifact-panel にインライン編集機能追加（CodeMirror for code、ProseMirror for text/markdown、contentEditable for HTML）→ 編集内容を DB に保存 → 次ターンの上下文注入で agent が編集を認識

### 6.6 バージョン管理

**以前の内容:**
- slide_page_versions テーブルで操作ごとにスナップショット
- SlidePanel ヘッダに `< v2/v5 >` ナビゲーション
- 旧バージョンは読み取り専用、「回復」で復元（新バージョンとして作成）

**再実装方法:**
- 既に実装済み。artifact_versions テーブル + 面板ヘッダのバージョン切替 UI

---

## 7. 設計思想

**旧**: 18,000 行の前端コードで LLM の代わりに意思決定（ウィザード、フェーズ管理、テンプレートマッチング）
**新**: 450 行の基盤コード + system prompt で LLM 自身が意思決定

根本的な違いは「誰が流程を制御するか」:
- 旧: フロントエンドが制御（ハードコードされたウィザード/フェーズ）
- 新: Agent が制御（会話の文脈に応じて自由に判断）

ユーザーが「テンプレートなしで直接作って」と言えば agent はテンプレートをスキップする。「英語で書いて」と言えば英語で生成する。「3 ページに収めて」と言えば 3 ページにする。これらは旧システムでは全て「未対応」だったが、新システムでは自然に対応できる。
