# rag-deploy テストフロー

> 対象環境: https://ai.agent.kakiage-kun.jp または localhost:4002
> 更新日: 2026-04-03

各ファイルは 1 つの完結したユーザーシナリオ。上から順に操作して `✅ CP` を確認する。

| # | ファイル | シナリオ |
|---|--------|---------|
| 01 | [01-first-chat.md](01-first-chat.md) | ログイン → 基本チャット |
| 02 | [02-chat-advanced.md](02-chat-advanced.md) | 編集・ブランチ・リジェネ・モデル切替・Thinking |
| 03 | [03-file-and-image.md](03-file-and-image.md) | ファイル添付 → 画像分析 → 画像生成 |
| 04 | [04-kb-ingest.md](04-kb-ingest.md) | KB 作成 → ドキュメント投入 → ステータス監視 |
| 05 | [05-rag-search.md](05-rag-search.md) | KB でチャット → 出典 → キャッシュ |
| 06 | [06-web-and-tools.md](06-web-and-tools.md) | Web 検索 → URL 読み取り → HTTP → DB クエリ |
| 07 | [07-knowledge-graph.md](07-knowledge-graph.md) | 3D ナレッジグラフ操作 |
| 08 | [08-crm-to-slides.md](08-crm-to-slides.md) | CRM 分析 → 提案書 → スライド生成・編集・エクスポート |
| 09 | [09-scheduler.md](09-scheduler.md) | 定時タスク管理 + 自律実行テスト |
| 10 | [10-skills.md](10-skills.md) | スキル作成 → チャットで呼び出し |
| 11 | [11-generative-ui.md](11-generative-ui.md) | AI 生成ウィジェット |
| 12 | [12-ui-and-errors.md](12-ui-and-errors.md) | UI・テーマ・レスポンシブ・異常系 |

## チェックリスト

- [ ] 01 ログイン・基本チャット
- [ ] 02 チャット高度操作
- [ ] 03 ファイル・画像
- [ ] 04 KB インジェスト
- [ ] 05 RAG 検索
- [ ] 06 Web・ツール
- [ ] 07 ナレッジグラフ
- [ ] 08 CRM → 提案 → スライド
- [ ] 09 定時タスク
- [ ] 10 スキル
- [ ] 11 Generative UI
- [ ] 12 UI・異常系
