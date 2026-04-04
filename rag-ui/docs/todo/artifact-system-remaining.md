# Artifact System — 残作業

前回の大規模リファクタリング（`docs/handover/artifact-system-refactor.md` 参照）で、旧 SlidePanel/ProposalPanel を削除し、統一的な artifact システムを構築した。以下は未完了・未テストの項目。

## 前提

- ブランチ: `main`（`feat/artifact-system` からマージ済み）
- バックアップ: `backup/pre-artifact-refactor`
- ローカル Docker (OrbStack): `localhost:4002` で動作確認可能
- CRM: Salesforce のみ接続済み、Kintone は未設定

## 未テスト項目

### 1. Artifact サイドパネルの滑動アニメーション
- `components/artifact-panel.tsx` に `motion/react` の `AnimatePresence` + `motion.div` を追加済み
- `AnimatedArtifactPanel` コンポーネントで slide-in/slide-out（width: 0→560px）
- **要テスト**: 実際にアニメーションが動作するか確認。開く・閉じる両方

### 2. 提案書が artifact に入るか
- system prompt に「提案書は必ず artifact(kind:"html") で作成、チャットに直接書くのは禁止」を追加済み
- **要テスト**: 「山田製造株式会社の提案書を作って」等で artifact 侧边栏に HTML が生成されるか
- 前回テスト時は AI が prompt を無視してチャットに直接書いた。prompt を強化したが未確認

### 3. Kintone 未接続時の応答
- system prompt に「利用不可の CRM: Kintone — ツールを呼び出さないこと。別の CRM で代用してはいけない」を動的注入済み
- `crm-service/src/routes/health.ts` に `/capabilities` エンドポイント追加済み
- **要テスト**: 「Kintoneの商談一覧を見せて」→ AI がツールを呼ばずに「接続されていません」と返すか
- 前回テスト時は AI が Salesforce にすり替えた。prompt をさらに強化したが未確認

### 4. ファイル一覧ボタン
- `artifact-store.ts` に `artifactList` + `upsertArtifactListItem` を追加済み
- `artifact-panel.tsx` に `ArtifactListDropdown`（Files アイコン）追加済み
- `app/api/artifacts/route.ts` に `?list=true` パラメータ追加済み
- `lib/artifact-db.ts` に `listArtifactsByConversation` 追加済み
- **要テスト**: 同一会話で複数 artifact 生成 → Files ボタンが表示 → クリックで一覧 → 切替

### 5. Starter prompt の更新
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

## 関連ファイル

| ファイル | 内容 |
|---------|------|
| `docs/handover/artifact-system-refactor.md` | リファクタリングの全体記録（旧システム→新システム） |
| `lib/artifact-db.ts` | DB schema + CRUD |
| `lib/artifact-tool.ts` | Tool 工場（writer 経由で streaming） |
| `lib/artifact-store.ts` | Zustand store（streaming + artifact list） |
| `components/artifact-panel.tsx` | サイドパネル（アニメーション + ファイル一覧） |
| `app/api/chat/route.ts` | streamText + CRM tools + artifact context injection |
| `crm-service/src/routes/health.ts` | /capabilities エンドポイント |
