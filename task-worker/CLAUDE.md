# task-worker — 定時タスク実行ワーカー

Bun + Hono で構築した非同期 AI エージェントワーカー。`scheduled_tasks` テーブルの設定に基づき、Valkey キューから取り出したタスクを AI ツールループで実行する。

## アーキテクチャ

```
Valkey BRPOP  →  worker.ts  →  executor.ts  →  generateText (Vercel AI SDK)
                                                 └─ tools: searchKB / webSearch / readUrl /
                                                           google_search / crmApi / executeCode /
                                                           createFile / generateImage / sendEmail /
                                                           loadSkill
```

- **HTTP サーバー**: Hono (port 8010) — `/health` のみ公開
- **キュー**: Valkey `LPUSH task-worker:queue` でタスクを投入、BRPOP で消費
- **AI プロバイダー**: `ai-provider.ts` で Gemini (AI Studio) / Vertex AI を自動切替

## ファイル構成

```
task-worker/
├── Dockerfile               # oven/bun:1
├── .dockerignore
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts             # Hono app 起動 + worker ループ開始
    ├── routes/
    │   └── health.ts        # GET /health
    └── lib/
        ├── ai-provider.ts   # Gemini/Vertex AI 切替 + getModel() + getImageModel() + googleSearchTool
        ├── db.ts            # pg Pool + ensureTables()（scheduled_tasks / task_executions / task_notifications）
        ├── skills-db.ts     # skills テーブル読取（getEnabledSkillSummaries / getSkillByName）
        ├── worker.ts        # BRPOP 消費ループ + stale recovery
        ├── executor.ts      # AI tool-loop 実行エンジン
        ├── tools.ts         # 全ツール定義（buildTools + listKBs）
        ├── sandbox.ts       # OpenSandbox SDK wrapper + /output/ ストリーミングアップロード
        ├── notify.ts        # task_notifications テーブル書込
        ├── email.ts         # Resend タスク完了通知
        └── emails/
            ├── task-result.tsx   # タスク完了通知メールテンプレート
            └── ai-email.tsx      # AI sendEmail ツール用テンプレート（Markdown 対応）
```

## AI ツール一覧

| ツール | 種別 | 使用条件 |
|--------|------|---------|
| `searchKnowledgeBase` | filterable | `kbSlug` 指定時は固定 KB、未指定時は auto-discovery（LightRAG から KB 一覧取得、AI が選択） |
| `webSearch` | filterable | `TAVILY_API_KEY` 設定時のみ有効 |
| `readUrl` | filterable | 常に有効（Tavily extract または直接 fetch）|
| `google_search` | **implicit** | `TAVILY_API_KEY` 未設定 かつ AI Studio 使用時に自動追加。`allowedTools` フィルター対象外 |
| `crmApi` | filterable | `CRM_SERVICE_URL` 設定時のみ有効 |
| `executeCode` | filterable | `OPENSANDBOX_URL` 設定時のみ有効 |
| `createFile` | filterable | 常に有効（`RAG_UI_URL` 経由でアップロード）|
| `generateImage` | filterable | Gemini AI Studio または Vertex AI 使用時に自動追加 |
| `analyzeImage` | filterable | 常に有効。Gemini Vision で画像分析（OCR、チャート読取、内容説明）|
| `readFile` | filterable | 常に有効。以前の createFile/executeCode/generateImage の結果ファイルを読み取り |
| `httpRequest` | filterable | 常に有効。任意の外部 REST API 呼出（GET/POST/PUT/PATCH/DELETE）|
| `queryDatabase` | filterable | 常に有効。PostgreSQL に対する READ ONLY SQL クエリ（10s タイムアウト）|
| `editFile` | filterable | 常に有効。既存ファイルのテキスト編集（replace/append/prepend/insertAfter）|
| `listFiles` | filterable | 常に有効。現在/過去の実行のファイル一覧取得 |
| `grepFiles` | filterable | 常に有効。テキストファイル内容を正規表現で横断検索 |
| `sendEmail` | filterable | `RESEND_API_KEY` 設定時のみ有効 |
| `loadSkill` | **implicit** | 有効なスキルが DB に存在する時に自動追加。`allowedTools` フィルター対象外 |

**filterable** = `scheduled_tasks.allowed_tools` で制限可能
**implicit** = 条件が揃えば常に追加、ユーザーがフィルター不可

## executor.ts の動作フロー

1. `getEnabledSkillSummaries()` + `listKBs()` を並列取得
2. `buildTools({ executionId, skills, kbList, kbSlug })` でツールマップ構築
3. `allowedTools` フィルターを filterable ツールのみに適用
4. `google_search` を implicit ツールとして追加（Tavily 未設定 & AI Studio 時）
5. skills がある場合は system prompt にスキル一覧を注入
6. `generateText` で AI ループ実行（`stopWhen: stepCountIs(maxToolCalls)`）
7. 完了後: DB 更新 → 通知作成 → メール送信

## sandbox.ts の注意点

- ファイル書込: `sandbox.files.writeFiles([{ path, data }])` — 旧 `write()` は廃止
- ストリーミングアップロード: `readBytesStream()` が `AsyncIterable<Uint8Array>` を返す。`ReadableStream.from()` は Bun では動作するが TS 型定義にないためキャスト必要
- `/output/` のファイルは実行後自動アップロード（`POST /api/task-files`、multipart/form-data）

## ai-provider.ts

```typescript
getModel(modelOverride?)     // Vertex AI → AI Studio の順で優先
getImageModel()              // vertex.image() または gemini.image() で gemini-3.1-flash-image-preview
googleSearchTool             // gemini.tools.googleSearch({}) — AI Studio のみ（Vertex AI 非対応）
```

**画像モデル**: Vertex AI / AI Studio 両方で `image("gemini-3.1-flash-image-preview")`。`imagen-3.0-generate-002` 等は使わない（rag-ui と統一）。

## 環境変数

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Gemini AI Studio API Key（`USE_VERTEX_AI` と排他）|
| `USE_VERTEX_AI` | `true` で Vertex AI 使用（GCP Free Trial credit 対応）|
| `GCP_PROJECT_ID` | Vertex AI GCP プロジェクト ID |
| `GCP_LOCATION` | GCP リージョン（デフォルト `global`）|
| `GEMINI_MODEL` | デフォルトモデル（デフォルト `gemini-3.5-flash`）|
| `GEMINI_IMAGE_MODEL` | 画像生成モデル（デフォルト `gemini-3.1-flash-image`、fallback `gemini-2.5-flash-image`）|
| `DATABASE_URL` | PostgreSQL 接続 URL |
| `REDIS_URL` | Valkey 接続 URL |
| `LIGHTRAG_URL` | LightRAG サービス URL（KB 検索・一覧取得）|
| `RAG_UI_URL` | rag-ui URL（ファイルアップロード先）|
| `CRM_SERVICE_URL` | CRM サービス URL（設定時のみ crmApi ツール有効）|
| `OPENSANDBOX_URL` | OpenSandbox URL（コード実行）|
| `TASK_WORKER_URL` | 自分自身の URL（rag-ui が通知確認に使用）|
| `TAVILY_API_KEY` | Tavily API Key（未設定時は google_search にフォールバック）|
| `RESEND_API_KEY` | Resend API Key（タスク完了メール送信）|
| `EMAIL_FROM` | 送信元メールアドレス |
| `SANDBOX_PYTHON_IMAGE` | sandbox イメージ名（デフォルト `sandbox-python:latest`）|

## 開発コマンド

```bash
bun run dev    # watch モードで起動
bun run start  # 本番起動
bunx tsc --noEmit  # 型チェック
```

## 既知の制約

- タスクは非同期・直列実行（Valkey BRPOP で 1 件ずつ処理）
- `executeCode` の各呼出しはステートレス（前の呼出しのファイルは残らない）
- google_search は Vertex AI では使えない（Tavily が必要）
- generateImage は MLX バックエンドでは使えない（Gemini 必須）
