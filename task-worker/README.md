# task-worker

rag-deploy の定時タスク実行ワーカー。スケジュールされた AI タスクを Valkey キューから取り出し、ツールループで自律実行する。

## 機能

- **定時タスク実行**: cron スケジュールに基づき自動実行
- **手動トリガー**: rag-ui の `/api/scheduler/[id]/run` から即時実行可能
- **AI ツールセット**:
  - ナレッジベース検索（RAG、KB auto-discovery 対応）
  - ウェブ検索（Tavily / Gemini Google Search grounding）
  - コード実行（OpenSandbox — Python/bash/JS、`/output/` 自動アップロード）
  - 画像生成（Gemini `gemini-3.1-flash-image-preview`）
  - CRM 操作（Salesforce / Kintone）
  - ファイル作成・メール送信
  - **スキル**（DB 管理のドメイン知識を自動注入）

## 技術スタック

- **ランタイム**: Bun
- **HTTP**: Hono (port 8010、内部のみ)
- **AI**: Vercel AI SDK v6 + Gemini (AI Studio / Vertex AI)
- **キュー**: Valkey (Redis 互換) BRPOP
- **DB**: PostgreSQL (shared with rag-ui)

## 起動

```bash
bun run dev    # 開発（watch）
bun run start  # 本番
```

Docker では `docker compose --profile prod up -d` で自動起動。

## 詳細

→ [CLAUDE.md](./CLAUDE.md)
