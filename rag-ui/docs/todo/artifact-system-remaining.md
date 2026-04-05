# Artifact System — 残作業

前回の大規模リファクタリング（`docs/handover/artifact-system-refactor.md` 参照）で、旧 SlidePanel/ProposalPanel を削除し、統一的な artifact システムを構築した。以下は未完了・未テストの項目。

## 前提

- ブランチ: `main`（`feat/artifact-system` からマージ済み）
- バックアップ: `backup/pre-artifact-refactor`
- ローカル Docker (OrbStack): `localhost:4002` で動作確認可能
- CRM: Salesforce のみ接続済み、Kintone は未設定

## テスト済み項目

### 1. Artifact サイドパネルの滑動アニメーション — 確認済み (2026-04-05)
- `components/artifact-panel.tsx` に `motion/react` の `AnimatePresence` + `motion.div` を追加済み
- `AnimatedArtifactPanel` コンポーネントで slide-in/slide-out（width: 0→560px）
- 面板は正常に開閉する。アニメーションは動作確認済み

### 2. 提案書が artifact に入るか — 確認済み (2026-04-05)
- system prompt に「提案書は必ず artifact(kind:"html") で作成、チャットに直接書くのは禁止」を追加済み
- テスト:「山田製造株式会社の提案書を作って」→ artifact 侧面パネルに HTML 提案書が正常生成
- AI が CRM tool（Salesforce 商談一覧、KB 検索、Web 検索）を呼出し → artifact create で提案書 HTML 生成

### 4. ファイル一覧ボタン — 修正済み (2026-04-05)

**発見した 2 つのバグを修正:**

**Bug 1: 多 tool グループで ArtifactCard が表示されない**
- 原因: `chat-message.tsx` の `ToolGroup` で `ArtifactCard` は `tools.length === 1` の場合のみ表示。artifact tool が他の tool（searchKnowledgeBase、webSearch 等）と同じメッセージにある場合、summary + collapsible 表示になり `ToolCallIndicator` のみ表示
- 追加の原因: tool result データが `result` ではなく `output` フィールドに格納されていた（`t.part.result ?? t.part.output` が必要）
- 修正: 多 tool グループで artifact tool を分離し、折り畳み区域の外に `ArtifactCard` として常時表示

**Bug 2: ファイル一覧で切替後 iframe 内容が更新されない**
- 原因: `WidgetRendererInner` の `finalizedRef.current` が finalize 後 `true` のまま。artifact 切替で新 content が来ても `sendUpdate` と finalize `useEffect` が両方スキップ
- 修正: `PanelContent` に `key={id}` を追加。artifact 切替時に React がコンポーネントを再マウントし、全 ref が自動リセット

**変更ファイル:**
- `components/chat-message.tsx`: 多 tool グループで ArtifactCard を分離表示 + `output` fallback
- `components/artifact-panel.tsx`: `PanelContent` に `key={id}` 追加

**テスト結果:**
- 同一会話で複数 artifact 生成 → Files ボタンが表示 → クリックで一覧 → 切替で iframe 内容が正常更新
- 会話復元時も ArtifactCard が正常表示、クリックで面板開放
- 双方向切替（提案書 ↔ ダッシュボード）正常動作

## 未対応項目

### 3. Kintone 未接続時の応答 — 部分的に動作 (要 prompt 強化)
- system prompt に「利用不可の CRM: Kintone — ツールを呼び出さないこと。別の CRM で代用してはいけない」を動的注入済み
- `crm-service/src/routes/health.ts` に `/capabilities` エンドポイント追加済み
- テスト結果: AI は「Kintone は接続されていません」と正しく回答するが、続けて「Salesforce であれば接続されており…確認されますか？」と代替を提案してしまう
- **要対応**: prompt をさらに強化し、代替 CRM の提案も禁止する

### 5. Starter prompt の更新 — 未対応
- トップ画面の「Kintone 商談デモ」ボタンが残っている
- Kintone は未接続なのでこのボタンを押すと失敗する
- **要対応**: ボタンを削除するか、Salesforce 版に変更するか、Kintone 接続時のみ表示する

## 今回のセッションで修正した CRM 関連の変更

### tool 分割
- 旧: `listDeals(source)` / `fetchDealData(source, dealId)`
- 新: `listSalesforceDeals` / `listKintoneDeals` / `fetchSalesforceData` / `fetchKintoneData`
- `inputDealDataManually` は削除（CRM 接続が前提のため不要）

### 条件付き tool 登録
- `crm-service /capabilities` → `{ salesforce: bool, kintone: bool }` を返す
- `route.ts` で capabilities を取得し、接続済みの CRM tools のみ登録
- system prompt も動的生成（接続済みの CRM のみ記載 + 未接続 CRM を明示）

### ToolCallIndicator
- tool 名から直接表示名を生成（例: `listSalesforceDeals` → 「Salesforceから商談一覧を取得しました」）
- `args.source` を読む必要なし

### データ表示ルール（system prompt）
- 商談一覧: Markdown テーブルで表示（show-widget 不可）
- show-widget: チャート・ゲージ等のインタラクティブ可視化のみ
- 英語フィールド: 日本語に翻訳して表示（ステージ名マッピングは prompt で指示）

## Skills + Chat Files 関連（2026-04-05 実装済み）

### 実装済み
- [x] Skills ファイルシステム化（agentskills.io 準拠、`data/skills/{id}/` にディスク保存）
- [x] `loadSkill` tool が `skillDirectory` を返却（progressive disclosure L3）
- [x] 内置 Skills 機構（`built-in-skills/` → 起動時自動同步、`source_type = "built-in"`）
- [x] `chat_files.message_id` 列追加 + `generateImage` ファイル関連付け
- [x] `FileCard` UI コンポーネント（Claude Web スタイル）

### 未対応
- [ ] `FileCard` のデータ接続: `chat-page.tsx` → `ChatMessage` に `files` prop を渡す
- [ ] 歴史メッセージ読込時に `chat_files` を JOIN して返す
- [ ] `executeCode` tool をチャット route に追加（opensandbox 経由、FileCard の主要ユースケース）

詳細: `docs/handover/skills-filesystem-refactor.md`

## CRM 提案書ワークフロー実装（2026-04-05/06 実装済み）

### 実装済み
- [x] `built-in-skills/crm-proposal/SKILL.md` — CRM 分析 → KPI → 提案書生成の完全ワークフロー
- [x] `analyzeDeal` を crm-service `/deals/analyze` に委譲（決定的スコアリング、AI は根拠のみ）
- [x] `artifact-tool.ts` の `unesc()` — LLM JSON エスケープ修正（空白スライドの根本原因）
- [x] `artifact-panel.tsx` — 完全 HTML ドキュメントの直接 `srcdoc` 渲染（白画面バグ修正）
- [x] `artifact-panel.tsx` — HTML スライド artifact の PDF/PPTX エクスポートボタン
- [x] `built-in-skills.ts` — `source_type` を SELECT に追加（内置スキル更新が実際に動作するよう修正）
- [x] `crm-service/src/lib/scoring.ts` — contacts/activities/account の null 安全対応
- [x] `app/api/chat/route.ts` — `stepCountIs(15)` → `stepCountIs(30)` に増加
- [x] System prompt に CRM ワークフローブリッジ追加（analyzeDeal → loadSkill('crm-proposal')）
- [x] `sessionData.data` 二重ネストバグ修正

## 関連ファイル

| ファイル | 内容 |
|---------|------|
| `docs/handover/artifact-system-refactor.md` | リファクタリングの全体記録（旧システム→新システム） |
| `docs/handover/skills-filesystem-refactor.md` | Skills ファイルシステム化 + Chat Files 記録 |
| `lib/artifact-db.ts` | DB schema + CRUD |
| `lib/artifact-tool.ts` | Tool 工場（writer 経由で streaming） |
| `lib/artifact-store.ts` | Zustand store（streaming + artifact list） |
| `lib/skill-storage.ts` | Skills ディスク I/O |
| `lib/built-in-skills.ts` | 起動時内置スキル自動同步 |
| `components/artifact-panel.tsx` | サイドパネル（アニメーション + ファイル一覧 + `key={id}` で切替対応） |
| `components/chat-message.tsx` | ArtifactCard + FileCard（多 tool グループ対応 + `output` fallback） |
| `app/api/chat/route.ts` | streamText + CRM tools + artifact context injection + loadSkill + stepCountIs(30) |
| `built-in-skills/crm-proposal/SKILL.md` | CRM 提案書ワークフロースキル |
| `crm-service/src/routes/health.ts` | /capabilities エンドポイント |
| `crm-service/src/routes/analyze.ts` | /deals/analyze（決定的スコアリング + Gemini 根拠生成） |
| `crm-service/src/lib/scoring.ts` | スコアリングアルゴリズム（null 安全対応済み） |
