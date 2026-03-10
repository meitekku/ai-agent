# rag-ui — RAG チャットフロントエンド

LightRAG ベースの知識グラフ検索 + LLM ストリーミング生成を組み合わせた RAG チャットインターフェース。

## 主な機能

- **ナレッジベースチャット** — LightRAG ハイブリッド検索 + Gemini/MLX LLM 生成（キャッシュ時 ~14ms）
- **ドキュメント管理** — PDF アップロード / 一覧 / 削除（OCR → 知識グラフ入庫）
- **スライド生成** — チャット回答からプレゼンテーション自動生成 + PPTX エクスポート（構造化 / 画像ベース）
- **LLM 自動切替** — `GEMINI_API_KEY` があれば Gemini、なければ MLX にフォールバック

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **UI**: shadcn/ui + AI Elements
- **AI**: Vercel AI SDK v6 (`ToolLoopAgent`, `generateObject`, `useChat`)
- **LLM**: Gemini API（デフォルト） / MLX Qwen3.5-35B-A3B（フォールバック）
- **検索**: LightRAG（知識グラフ + ベクトル検索）
- **キャッシュ**: Valkey（Redis 互換、セマンティックキャッシュ）
- **ランタイム**: Bun

## クイックスタート

```bash
# 依存サービスが起動済みであること（LightRAG, PostgreSQL, Valkey, Ollama）

bun install
bun dev          # 開発サーバー起動（GEMINI_API_KEY 未設定時は MLX フォールバック）
```

## 環境変数

| 変数             | デフォルト                           | 説明                                      |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| `GEMINI_API_KEY` | —                                    | Gemini API Key（設定→Gemini、未設定→MLX） |
| `GEMINI_MODEL`   | `gemini-2.5-flash`                   | Gemini モデル                             |
| `LIGHTRAG_URL`   | `http://localhost:8007`              | LightRAG サービス                         |
| `MLX_URL`        | `http://localhost:8008`              | MLX LM Server（フォールバック用）         |
| `MLX_MODEL`      | `mlx-community/Qwen3.5-35B-A3B-4bit` | MLX モデル                                |
| `OLLAMA_URL`     | `http://localhost:11434`             | Ollama（Embedding 専用）                  |
| `REDIS_URL`      | `redis://localhost:6379`             | Valkey キャッシュ                         |

詳細は [CLAUDE.md](./CLAUDE.md) を参照。

## アーキテクチャ

```
ブラウザ (useChat) → /api/chat → Valkey キャッシュ確認
                                → LightRAG ハイブリッド検索 (~0.1s)
                                → Gemini/MLX ストリーミング生成
                                → Valkey キャッシュ保存
```

## 依存サービス

| サービス      | ポート | 用途                                      |
| ------------- | ------ | ----------------------------------------- |
| Gemini API    | —      | LLM 推論（デフォルト、API Key 必要）      |
| MLX LM Server | 8008   | LLM 推論（フォールバック、ローカル）      |
| LightRAG      | 8007   | 知識グラフ検索 + ドキュメント入庫         |
| PostgreSQL    | 5432   | ベクトルストレージ（pgvector）            |
| Valkey        | 6379   | クエリキャッシュ                          |
| Ollama        | 11434  | Embedding（qwen3-embedding:8b, 4096次元） |
| glm-ocr       | 8000   | PDF OCR                                   |
