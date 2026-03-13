# SalesNavi AI — 技術スタック詳細

**FleGrowth Inc.**

本ドキュメントでは、SalesNavi AI を構成する主要技術とその採用理由を解説します。

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│  フロントエンド                                              │
│  Next.js 16 + React 19 + TypeScript + Tailwind CSS v4       │
│  Vercel AI SDK v6 (useChat / ToolLoopAgent / Tool Calling)  │
│  shadcn/ui + Motion + streamdown                            │
├─────────────────────────────────────────────────────────────┤
│  バックエンド                                                │
│  Python 3.12 + FastAPI + uvicorn                            │
│  LightRAG (Knowledge Graph RAG)                             │
│  PyMuPDF (PDF 処理) + OCR                                   │
├─────────────────────────────────────────────────────────────┤
│  データ層                                                    │
│  PostgreSQL 18 + pgvector (ベクトル検索)                     │
├─────────────────────────────────────────────────────────────┤
│  インフラ                                                    │
│  Docker Compose (GPU 不要)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## コア技術

### 1. LightRAG — ナレッジグラフ RAG エンジン

| 項目 | 内容 |
|---|---|
| リポジトリ | [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) (香港大学) |
| 役割 | ドキュメントからエンティティと関係性を自動抽出し、Knowledge Graph + Vector Store で管理 |
| 採用理由 | 従来の「チャンク分割 → ベクトル検索」型 RAG と異なり、知識の関係性を構造的に把握。複雑な質問にも高精度で回答可能 |

**従来の RAG との比較:**

```
従来の RAG:
  ドキュメント → チャンク分割 → ベクトル化 → 類似検索 → 回答
  ⚠️ チャンク境界を跨ぐ情報は欠落、関係性の把握が困難

LightRAG:
  ドキュメント → エンティティ抽出 → 関係性マッピング → Knowledge Graph 構築
                                                          ↓
  質問 → ベクトル検索 + グラフ探索（ハイブリッド） → 関係性を踏まえた高精度回答
  ✅ ドキュメント間の関係性も把握、複合的な質問にも対応
```

**本プロジェクトでの構成:**
- マルチナレッジベース: `workspace` パラメータで KB ごとに独立した Knowledge Graph を管理
- LRU キャッシュ: 複数 KB インスタンスを LRU で管理し、メモリ使用量を最適化
- Embedding 速率制限: 無料枠 API の制限に対応する Semaphore ベースのレートリミッター
- PostgreSQL バックエンド: pgvector でベクトルデータを永続化（NetworkX グラフはファイルストレージ）

### 2. Vercel AI SDK — AI インテグレーションフレームワーク

| 項目 | 内容 |
|---|---|
| パッケージ | `ai` v6 + `@ai-sdk/react` + `@ai-sdk/google` + `@ai-sdk/openai` |
| 役割 | LLM との通信、ストリーミング、Tool Calling、構造化出力を統一 API で提供 |
| 採用理由 | プロバイダー抽象化により LLM の差替えが容易。React フックでリアルタイム UI を実現 |

**本プロジェクトでの活用:**

```typescript
// ToolLoopAgent — AI が必要なツールを自動判断して実行
const agent = new ToolLoopAgent({
  model: chatModel,        // LLM プロバイダー（差替え可能）
  instructions: systemPrompt,
  tools: {
    searchKnowledgeBase,   // KB 検索
    webSearch,             // ウェブ検索
    readPage,              // ページ全文取得
    generateSlides,        // スライド生成トリガー
    readUrl,               // URL 読取
  },
  stopWhen: stepCountIs(10),  // 最大 10 ステップ
});
```

**主要機能:**
- **Tool Calling**: AI が質問内容に応じてツール使用を自律判断（KB 検索 → 不足ならウェブ検索 → 全文取得 → 回答）
- **ストリーミング**: `useChat` フックでリアルタイムにレスポンスを UI に反映
- **プロバイダー切替**: `@ai-sdk/google`（クラウド）/ `@ai-sdk/openai`（ローカル MLX）を設定だけで切替
- **構造化出力**: `generateObject` + Zod スキーマでスライドデッキ等の構造化データを生成

### 3. Tavily — ウェブ検索 API

| 項目 | 内容 |
|---|---|
| サービス | [Tavily](https://tavily.com/) — AI エージェント向けリアルタイムウェブ検索 API |
| 役割 | KB にない最新情報やリアルタイム情報をウェブから取得 |
| 採用理由 | AI エージェント向けに最適化（関連性スコア付き、ページ全文抽出対応）。フォールバック機構あり |

**本プロジェクトでの活用:**
- **Search API**: ウェブ検索 → 関連性スコア ≥ 0.4 でフィルタ → 不足時は Advanced 検索に自動リトライ
- **Extract API**: 検索結果の URL から全文を抽出（サマリーだけで回答しない）
- **フォールバック**: Tavily API Key 未設定時は LLM 内蔵のウェブ検索機能にフォールバック
- **トピック分類**: `general` / `news` / `finance` でクエリを最適化

### 4. PostgreSQL + pgvector — ベクトル対応 RDB

| 項目 | 内容 |
|---|---|
| バージョン | PostgreSQL 18 + pgvector 拡張 |
| 役割 | ベクトルデータ（Embedding）と業務データ（チャット履歴、スライド、スキル等）を統合管理 |
| 採用理由 | 専用のベクトル DB を追加せず、1 つの DB で全データを管理。運用コストを最小化 |

**管理するデータ:**
- LightRAG のベクトルストア（Embedding）
- チャット会話・メッセージ（ツリー構造でブランチ管理）
- スライドデッキ・テンプレート
- スキル定義
- ファイルメタデータ
- UI 設定

### 5. Python + FastAPI — バックエンド API

| 項目 | 内容 |
|---|---|
| ランタイム | Python 3.12 + uv（パッケージマネージャ） |
| フレームワーク | FastAPI + uvicorn（async 対応） |
| 役割 | LightRAG ラッパー + ドキュメント管理 + OCR + Ingest 処理 |

**主要ライブラリ:**

| ライブラリ | 用途 |
|---|---|
| `lightrag-hku[api]` | LightRAG エンジン本体 |
| `asyncpg` | PostgreSQL 非同期クライアント |
| `pgvector` | pgvector Python バインディング |
| `pymupdf` | PDF テキスト抽出（OCR 前処理） |
| `httpx` | 非同期 HTTP クライアント |
| `python-multipart` | ファイルアップロード処理 |

**非同期 Ingest パイプライン:**
```
ファイルアップロード
    ↓
asyncio.Queue に追加（即座にレスポンス返却）
    ↓
単一 Worker が順次処理:
  PDF → PyMuPDF テキスト抽出 → OCR（必要時） → LightRAG エンティティ抽出 → KB 登録
    ↓
フロントエンドが 5 秒ポーリングでステータス確認
```

### 6. Next.js 16 — フロントエンドフレームワーク

| 項目 | 内容 |
|---|---|
| バージョン | Next.js 16 (App Router) + React 19 + TypeScript |
| ビルド | `output: "standalone"`（Docker 最適化） |
| ランタイム | Bun |

**UI ライブラリ:**

| ライブラリ | 用途 |
|---|---|
| `shadcn/ui` + Radix UI | アクセシブルなベース UI コンポーネント |
| `Tailwind CSS v4` | ユーティリティファーストの CSS |
| `motion` (Framer Motion) | アニメーション・トランジション |
| `streamdown` | AI レスポンスの Markdown リアルタイムレンダリング（CJK/コード/数式/Mermaid 対応） |
| `Zustand` | 軽量ステート管理（チャット設定、サイドバー、スライド状態） |
| `@tanstack/react-query` | サーバーデータのフェッチ・キャッシュ（チャット履歴等） |
| `Lucide React` | アイコンライブラリ |
| `@xyflow/react` | Knowledge Graph のインタラクティブ可視化 |
| `Mermaid` | チャート・ダイアグラム描画 |
| `Shiki` | コードのシンタックスハイライト |

---

## スライド自動生成パイプライン

チャットの AI 回答から PPTX / PDF 形式のプレゼン資料を自動生成する機能です。

### 技術構成

```
ユーザー: 「この内容でスライドを作って」
    ↓
AI Tool Calling: generateSlides ツール発火
    ↓
セットアップウィザード（産業/対象者/配色/枚数を選択）
    ↓
LLM: スライド構成プラン生成（Markdown）
    ↓
LLM × N: 各スライドの HTML 生成（スタイル・テンプレート適用）
    ↓
ブラウザ内プレビュー＋編集
    ↓
エクスポート: PPTX or PDF
```

### エクスポート技術

| 形式 | ライブラリ | 方式 |
|---|---|---|
| **PPTX** | `pptxgenjs` | Mode A: HTML → Canvas → 画像スライド（見た目忠実）/ Mode B: 構造化 JSON → テキスト+チャート+表（編集可能） |
| **PDF** | `jspdf` | HTML → Canvas → Landscape PDF |
| **画像** | `html2canvas` | HTML スライドをキャンバスにレンダリング |

### 4 つのスライドモード

| モード | 特長 | DB 保存 |
|---|---|---|
| **HTML スライド** | スタイルオプション対応、テンプレート、ドラッグ編集、履歴管理 | あり |
| **ビジュアルスライド** | 7 種のプリセットスタイル、contentEditable 編集 | なし |
| **スライドスタジオ** | 構造化編集（箇条書き/表/チャート/Mermaid）、AI リファイン | なし |
| **簡易スライド** | シンプルなプレビュー + PPTX 出力 | なし |

### スタイル自動推定

コンテンツのキーワードを分析し、最適な産業・職種・配色を自動提案:

```
コンテンツ: 「クラウドサービスの API 連携による DX 推進」
    ↓
キーワードマッチング:
  IT/クラウド/API/DX → 産業: IT・通信
  DX/推進 → 職種: 経営企画
    ↓
自動提案:
  産業: IT・通信 → 配色: ブルー
```

---

## Tool Calling アーキテクチャ

AI が質問内容に応じてツールの使用を自律的に判断する仕組みです。

```
ユーザーの質問
    ↓
LLM（ToolLoopAgent, 最大 10 ステップ）
    ↓
    ├── 一般質問（挨拶、雑談、プログラミング等）
    │   → ツール不使用、直接回答
    │
    ├── KB 関連の質問
    │   → searchKnowledgeBase 実行
    │   → 不足時 → webSearch → readPage で全文取得
    │   → KB + ウェブの情報を統合して回答
    │
    ├── URL 提示
    │   → readUrl でページ内容を取得して回答
    │
    ├── スライド作成依頼
    │   → generateSlides ツール発火 → ウィザード表示
    │
    └── 最新情報・時事
        → webSearch → readPage → 出典付きで回答
```

**ツールの動的注入:**
- KB 選択時のみ `searchKnowledgeBase` ツールが有効化
- KB の `title` / `description` がツール説明文に動的注入 → AI が KB の内容を理解した上でツール使用を判断
- スキルシステムで追加の指示をシステムプロンプトに注入可能

---

## チャット履歴・ブランチ管理

Git のブランチモデルに着想を得た、メッセージのツリー管理:

```
User1 ── Assistant1 ── User2 ── Assistant2（メインパス）
                         │
                         ├── User2' ── Assistant2'（編集ブランチ）
                         │
                         └── User2'' ── Assistant2''（別の編集）
```

| 技術 | 役割 |
|---|---|
| `parent_id` カラム | メッセージの親子関係を定義 |
| `Zustand` ストア | ツリーの構築・パス計算・ブランチ切替をクライアント側で管理 |
| `active_leaf_id` | 現在アクティブなブランチの末端ノードを追跡 |
| `replaceState` | `/new` → `/chat/[id]` への URL 更新をリマウントなしで実行 |

---

## マルチモーダル対応

画像・PDF・テキストファイルをチャットに直接添付可能:

```
ファイル添付（D&D / クリップボード / ボタン選択）
    ↓
即座に /api/files/upload → ディスク保存 + DB メタデータ記録
    ↓
チャット UI にプレビュー表示（画像: サムネイル、PDF: アイコン）
    ↓
送信時: resolveServerFiles() がサーバー URL → Uint8Array バイナリ変換
    ↓
LLM API にバイナリとして直接送信（マルチモーダル推論）
```

---

## Docker コンテナ構成

```yaml
services:
  postgres:     # PostgreSQL 18 + pgvector — データ永続化
  lightrag:     # Python FastAPI — RAG エンジン + ドキュメント管理
  rag-ui:       # Next.js standalone — フロントエンド + API Routes

# 合計リソース: 約 410 MB（アイドル時）
# GPU 不要、API Key 1 つで稼働
```

| コンテナ | メモリ | 役割 |
|---|---|---|
| lightrag | ~254 MB | RAG エンジン、ドキュメント Ingest、OCR |
| rag-ui | ~109 MB | UI、チャット API、スライド生成、ファイル管理 |
| postgres | ~37 MB | 全データ永続化（ベクトル + 業務データ） |

---

## 依存関係まとめ

### バックエンド (Python)

| パッケージ | バージョン | 用途 |
|---|---|---|
| lightrag-hku[api] | latest | Knowledge Graph RAG エンジン |
| FastAPI | ≥ 0.115 | Web API フレームワーク |
| uvicorn[standard] | ≥ 0.34 | ASGI サーバー |
| asyncpg | latest | PostgreSQL 非同期ドライバ |
| pgvector | latest | pgvector Python バインディング |
| pymupdf | latest | PDF テキスト抽出 |
| httpx | ≥ 0.28 | 非同期 HTTP クライアント |
| psycopg2-binary | ≥ 2.9 | PostgreSQL 同期ドライバ（LightRAG 内部用） |

### フロントエンド (TypeScript)

| パッケージ | バージョン | 用途 |
|---|---|---|
| next | 16.1.6 | フルスタック React フレームワーク |
| react | 19.2.3 | UI ライブラリ |
| ai | 6.x | Vercel AI SDK（ToolLoopAgent, useChat） |
| @ai-sdk/google | 3.x | LLM プロバイダー |
| @ai-sdk/react | 3.x | React フック（useChat） |
| zod | 4.x | スキーマバリデーション + 構造化出力 |
| zustand | 5.x | ステート管理 |
| @tanstack/react-query | 5.x | サーバーステート管理 |
| streamdown | 2.x | Markdown ストリーミングレンダリング |
| motion | 12.x | アニメーション |
| pptxgenjs | 4.x | PPTX ファイル生成 |
| jspdf | 4.x | PDF ファイル生成 |
| html2canvas | 1.x | HTML → Canvas レンダリング |
| mermaid | 11.x | ダイアグラム描画 |
| shiki | 4.x | コードハイライト |
| @xyflow/react | 12.x | グラフ可視化 |
| pg | 8.x | PostgreSQL クライアント |
| shadcn + radix-ui | latest | UI コンポーネント |
| tailwindcss | 4.x | CSS フレームワーク |
| lucide-react | latest | アイコン |

### インフラ

| 技術 | 用途 |
|---|---|
| Docker Compose | マルチコンテナオーケストレーション |
| PostgreSQL 18 | RDB + ベクトルストア |
| pgvector | PostgreSQL ベクトル検索拡張 |
| Bun | Next.js ランタイム（Node.js 互換、高速起動） |
| uv | Python パッケージマネージャ（高速インストール） |
