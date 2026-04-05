# 双源問題 — useChat × useChatTreeStore

## 現状

チャットメッセージの状態管理が 2 つのソースに分裂している:

| ソース | 役割 | データ構造 |
|--------|------|-----------|
| **useChat** (AI SDK) | 流式レンダリング駆動。`sendMessage()` でリクエスト、streaming 中に `messages[]` が更新、UI がリアルタイム描画 | フラットな `UIMessage[]` |
| **useChatTreeStore** (Zustand) | ブランチ管理・永続化。`parent_id` によるツリー構造、`active_leaf_id` からパス逆算、DB 保存 | `nodes: Map<id, TreeNode>` |

## ブリッジ方式（現在の実装）

```
streaming 完了 → onFinish → useChat の messages を DB 保存（tree store 経由）
ブランチ切替 → tree store がパス計算 → setMessages() で useChat に同期
URL 更新 → /new で初回送信後 replaceState で /chat/[id] に変更
```

## 発生しうる問題

### 1. streaming 中のブランチ切替
useChat がまだ書き込み中に tree store が別のブランチに切り替わると、到着中のトークンが間違ったブランチに紐づく可能性がある。

### 2. 高速連続操作
編集 → 即座に再編集、再生成 → 即座にブランチ切替など、2 つの store の同期が追いつかないケースで不整合が発生する。

### 3. 履歴読込時の初期化順序
会話を再開した際に tree store と useChat の初期化タイミングがずれると、一部のメッセージしか表示されないことがある（テストで確認済み — 会話を開き直すと最初のメッセージ付近にスクロールできないケースがあった）。

## 理想的なリファクタリング方針

useChat を **純粋な transport 層**（流式通信専用）に降格し、UI レンダリングを tree store のみから駆動する:

```
現在:
  useChat.messages[] → UI 描画
  useChatTreeStore.nodes → ブランチ管理・DB

理想:
  useChat → 流式受信のみ（messages は内部バッファ）
  useChatTreeStore.nodes → UI 描画 + ブランチ管理 + DB
  streaming token → tree store にリアルタイム反映 → UI 更新
```

### メリット
- Single source of truth（ツリーのみ）
- ブランチ切替中の streaming 競合が構造的に解消
- 履歴読込が tree store からの一方向で済む

### デメリット・リスク
- AI SDK の useChat が提供する streaming 状態管理（isLoading, error, stop 等）を自前で再実装する必要がある
- 改動量が大きい（chat-page.tsx, chat-input.tsx, chat-message.tsx 全体に影響）
- AI SDK のバージョンアップで内部 API が変わるリスク

## 優先度

**低 — 展覧会後に検討**。通常の演示フローでは問題が顕在化しない。エッジケース（高速操作、streaming 中のブランチ切替）のみ。

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `lib/chat-tree.ts` | Zustand ツリーストア（ブランチ操作、パス計算） |
| `components/chat-page.tsx` | useChat + useChatTreeStore のブリッジ |
| `app/api/history/chats/[id]/messages/route.ts` | メッセージ DB 保存 |
