---
name: crm-proposal
description: CRM商談分析後のKPIダッシュボード表示と提案書スライド生成ワークフロー。analyzeDealの結果が返された後に自動で読み込む。商談分析・提案書・プレゼン資料に関連する場合に使用。
---

# CRM 商談分析 → 提案書ワークフロー

`analyzeDeal` の結果が返されたら、このスキルの手順に従って **KPI ダッシュボード表示** → **提案書スライド生成** を実行する。

---

## Phase 1: 分析結果の可視化

analyzeDeal の返り値（`analysis` オブジェクト）を受け取ったら、以下の順序で表示する。

### Step 1: テキスト概要（Markdown）

```markdown
## 商談分析: {account.Name} — {opportunity.Name}

**ステージ**: {StageName（日本語）} | **金額**: ¥{Amount} | **締切**: {CloseDate}

{1文の分析サマリー — 例: "受注確率72%の健全な商談です。予算規模と意思決定者の関与が強みですが、締切が近く迅速な対応が必要です。"}
```

### Step 2: スコアダッシュボード（show-widget #1）

以下のテンプレートを使い、analysis の値を埋め込んで `show-widget` を出力する。

**色ルール**: 値>70 → emerald(#059669/#ECFDF5), 40-70 → amber(#D97706/#FFFBEB), <40 → rose(#E11D48/#FFF1F2)

```show-widget
{"title":"deal_scores","widget_code":"<div class=\"space-y-4\"><div class=\"grid grid-cols-3 gap-3\"><div class=\"text-center\"><div class=\"relative w-24 h-14 mx-auto\"><svg viewBox=\"0 0 120 70\" class=\"w-full\"><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"rgba(150,150,150,0.15)\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"{COLOR_WIN}\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-dasharray=\"{DASH_WIN} 157\" style=\"transition:stroke-dasharray 1s\"/><text x=\"60\" y=\"58\" text-anchor=\"middle\" class=\"text-2xl font-bold\" fill=\"{COLOR_WIN}\">{WIN}%</text></svg></div><p class=\"text-xs font-medium text-gray-500 dark:text-gray-400 mt-1\">受注確率</p></div><div class=\"text-center\"><div class=\"relative w-24 h-14 mx-auto\"><svg viewBox=\"0 0 120 70\" class=\"w-full\"><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"rgba(150,150,150,0.15)\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"{COLOR_HEALTH}\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-dasharray=\"{DASH_HEALTH} 157\" style=\"transition:stroke-dasharray 1s\"/><text x=\"60\" y=\"58\" text-anchor=\"middle\" class=\"text-2xl font-bold\" fill=\"{COLOR_HEALTH}\">{HEALTH}</text></svg></div><p class=\"text-xs font-medium text-gray-500 dark:text-gray-400 mt-1\">健全度</p></div><div class=\"text-center\"><div class=\"relative w-24 h-14 mx-auto\"><svg viewBox=\"0 0 120 70\" class=\"w-full\"><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"rgba(150,150,150,0.15)\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M10 65 A50 50 0 0 1 110 65\" fill=\"none\" stroke=\"{COLOR_READY}\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-dasharray=\"{DASH_READY} 157\" style=\"transition:stroke-dasharray 1s\"/><text x=\"60\" y=\"58\" text-anchor=\"middle\" class=\"text-2xl font-bold\" fill=\"{COLOR_READY}\">{READY}</text></svg></div><p class=\"text-xs font-medium text-gray-500 dark:text-gray-400 mt-1\">提案準備度</p></div></div><div class=\"grid grid-cols-3 gap-2 text-xs\"><div class=\"rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2.5\"><p class=\"font-semibold text-emerald-700 dark:text-emerald-400\">楽観</p><p class=\"text-lg font-bold text-gray-900 dark:text-white\">{OPT_PROB}%</p><p class=\"text-gray-500 dark:text-gray-400\">¥{OPT_REV}</p><p class=\"text-gray-400 dark:text-gray-500\">{OPT_TL}</p></div><div class=\"rounded-lg bg-sky-50 dark:bg-sky-900/20 p-2.5\"><p class=\"font-semibold text-sky-700 dark:text-sky-400\">標準</p><p class=\"text-lg font-bold text-gray-900 dark:text-white\">{BASE_PROB}%</p><p class=\"text-gray-500 dark:text-gray-400\">¥{BASE_REV}</p><p class=\"text-gray-400 dark:text-gray-500\">{BASE_TL}</p></div><div class=\"rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2.5\"><p class=\"font-semibold text-amber-700 dark:text-amber-400\">悲観</p><p class=\"text-lg font-bold text-gray-900 dark:text-white\">{PESS_PROB}%</p><p class=\"text-gray-500 dark:text-gray-400\">¥{PESS_REV}</p><p class=\"text-gray-400 dark:text-gray-500\">{PESS_TL}</p></div></div></div>"}
```

**値の計算方法**:
- `{DASH_XXX}` = `Math.round(value / 100 * 157)` — SVG 円弧の dasharray（157 が半円全体）
- `{COLOR_XXX}` = 値>70 → `#059669`, 40-70 → `#D97706`, <40 → `#E11D48`
- `{OPT_REV}` 等の金額は万単位に変換（例: 50000000 → "5,000万"）

### Step 3: 要因ダッシュボード（show-widget #2）

```show-widget
{"title":"deal_factors","widget_code":"<div class=\"space-y-4\"><div><p class=\"text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2\">成功要因</p><div class=\"flex flex-wrap gap-1.5\">{KEY_DRIVERS_BADGES}</div></div><div><p class=\"text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2\">リスク要因</p><div class=\"flex flex-wrap gap-1.5\">{RISK_FACTORS_BADGES}</div></div><div><p class=\"text-sm font-semibold text-sky-700 dark:text-sky-400 mb-2\">推奨アクション</p><ol class=\"space-y-1 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside\">{ACTIONS_LIST}</ol></div></div>"}
```

**バッジ生成**:
- `{KEY_DRIVERS_BADGES}` = 各 keyDrivers を `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>{text}</span>` で展開
- `{RISK_FACTORS_BADGES}` = 各 riskFactors を `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>{text}</span>` で展開
- `{ACTIONS_LIST}` = 各 recommendedActions を `<li>{text}</li>` で展開

### Step 4: サービス推奨（Markdown テーブル）

```markdown
### 推奨サービス

| サービス | 関連度 | 理由 |
|---------|--------|------|
| {service} | **{relevance}** | {reason} |
| ... | ... | ... |

### 総合ソリューション

{combinedSolution}

### 顧客課題

{customerChallenges を箇条書き}
```

### Step 5: 確認または続行

**一括指示の判定**: ユーザーの元の指示に「提案書を作って」「提案書まで」「提案書も生成」等のフレーズが含まれている場合、確認をスキップして Phase 2 に直接進む。

**分析のみの場合**: 以下の確認プロンプトを表示する。

```
分析結果を確認してください。修正があればお伝えください。
問題なければ **「提案書を生成して」** と言ってください。
```

ユーザーがフィードバックした場合 → `reviseRationale` で分析を修正し、Step 1-5 を再表示する。

---

## Phase 2: スタイル選択

ユーザーが「提案書を生成して」と言ったら、以下を実行する。

### Step 1: 業界からスタイルを自動推定

CRM の `account.Industry` から html-slides のプリセットを選択する。

| 業界カテゴリ | 推奨プリセット | アクセント色 | 雰囲気 |
|-------------|---------------|-------------|--------|
| IT・テクノロジー | Electric Studio | #4361ee 青 | モダン・スマート |
| 製造・メーカー | Bold Signal | #FF5722 橙 | 力強い・信頼感 |
| 金融・保険 | Data Focus | システムフォント 深青 | データ重視・堅実 |
| 医療・ヘルスケア | Pastel Geometry | パステル | 清潔感・安心感 |
| 小売・サービス | Split Pastel | ピーチ+ラベンダー | 親しみやすい |
| 不動産・建設 | Bold Signal | #FF5722 橙 | 力強い・堅実 |
| 教育・公共 | Electric Studio | #4361ee 紺 | 知性的・公正 |
| その他・不明 | Keynote Apple | グラデーション | 万能・プロフェッショナル |

**金額による調整**:
- 大型案件（≥1000万円）→ よりフォーマルなプリセット（Data Focus, Keynote Apple）を優先
- 小型案件（<500万円）→ カジュアル寄り（Split Pastel, Notebook Tabs）も可

### Step 2: スタイル提示

**一括指示の場合**: スタイルの選択理由を 1 行で記載し、確認を待たず Phase 3 に直接進む。

**分析→確認→提案書の場合**: 以下を表示して確認を待つ。

```markdown
**提案書スタイル**: {プリセット名} を選択しました（{業界名} 向け）。
変更したい場合はお知らせください。そのまま進める場合は確認してください。
```

ユーザーが変更を希望した場合はプリセットを変更して再提示。確認（または異議なし）なら Phase 3 へ。

---

## Phase 3: 提案書生成

### Step 1: html-slides スキルを読み込む

```
loadSkill("html-slides")
```

html-slides の指示（GSAP アニメーション、スライド種別、プリセット詳細）を取得する。

### デザイン品質ルール（frontend-design 準拠）

提案書のデザインは以下の原則に従う:

- **タイポグラフィ**: 汎用フォント（Inter, Roboto, Arial）を避け、プリセットに合った個性的なフォントを使う。Display フォントと Body フォントを明確に使い分ける
- **カラー**: 主色 + アクセント色の 2 色を軸に、淡い色を均等に散らすのではなく、メリハリのある配色を心がける
- **レイアウト**: 左右対称の退屈な配置を避ける。Split レイアウト、非対称グリッド、余白の大胆な活用で記憶に残る構成にする
- **背景と装飾**: ベタ塗りの単色背景ではなく、グラデーション、微妙なテクスチャ、幾何学パターンで奥行きと雰囲気を出す
- **NG**: 紫グラデーション × 白背景、均等配置のカードグリッド、全スライド同じレイアウト。これらは「AI が作った感」の典型
- **重要**: 各スライドのレイアウトを意図的に変える。全部同じ構成（見出し＋3 カラムカード）の繰り返しにしない

### Step 2: スライド構成

以下の構成で提案書を生成する。案件の内容に応じて 9〜12 スライド。

| # | スライド種別 | タイトル例 | 内容ソース |
|---|-------------|-----------|-----------|
| 1 | **Title** | {会社名} 御中 ご提案書 | account.Name, opportunity.Name, 日付 |
| 2 | **Agenda** | 目次 | 以下のセクション一覧 |
| 3 | **Content** | 貴社について | account: Name, Industry, NumberOfEmployees, Description |
| 4 | **Content** | 貴社の課題 | rationale.customerChallenges |
| 5 | **Card Grid** | ご提案ソリューション (1) | rationale.serviceRecommendations の primary サービス。features をカードに |
| 6 | **Card Grid** | ご提案ソリューション (2) | secondary/optional サービス（あれば。なければスキップ）|
| 7 | **Content** | 総合ソリューション | rationale.combinedSolution — サービス間の連携を説明 |
| 8 | **Data/Chart** | 期待される効果 | rationale.expectedKPIs があれば Chart.js 棒グラフ。なければ定性的な改善点をカードで |
| 9 | **Content** | 概算費用 | opportunity.Amount がある場合は投資規模を提示（下記ルール参照）|
| 10 | **Flow/Process** | 導入スケジュール | rationale.nextActions をタイムラインステップで表示 |
| 11 | **Content** | ご提案のポイント | rationale.existingProposalHints（あれば）|
| 12 | **Closing** | ご清聴ありがとうございました | CTA + 連絡先（ダミー可）|

**スライド数調整**:
- serviceRecommendations が 1 つだけなら → スライド 5 のみ、6 はスキップ
- expectedKPIs がなければ → スライド 8 は定性的なメリットカードに変更
- opportunity.Amount がなければ → スライド 9（概算費用）はスキップ
- existingProposalHints がなければ → スライド 11 はスキップ

### Step 3: 分步生成（artifact）

html-slides の multi-slide 生成戦略に従う:

1. **`artifact create`**: HTML 骨格（DOCTYPE, CSS, JS, コントロール、ページ番号）+ スライド 1-4（Title, Agenda, 貴社について, 課題）
   - title: "{会社名} 提案書"
   - kind: "html"
2. **`artifact update`**: スライド 5-9 を追加（ソリューション, 総合, 効果, 概算費用）
   - oldStr: 最後のスライド `</div>` の直前（追加位置の目印）
   - newStr: 新スライドの HTML + 目印
3. **`artifact update`**: スライド 10-12 を追加（スケジュール, ポイント, Closing）+ `totalSlides` 変数の値を更新

**各 update 後に**: `goToSlide()` の `totalSlides` を実際のスライド数に更新すること。

### Step 4: 完了通知

```markdown
提案書を生成しました。サイドパネルで確認してください。
修正があればお伝えください（例: 「3ページ目のタイトルを変えて」「全体のトーンをもっとフォーマルに」）。
```

---

## Phase 4: 修正対応

| ユーザーの指示 | 対応 |
|---------------|------|
| 特定箇所の修正（タイトル変更、テキスト修正） | `artifact update`（oldStr/newStr） |
| 全体的なトーン変更、デザイン変更 | `artifact rewrite`（全体書き換え） |
| スライド追加・削除 | `artifact update`（該当箇所の挿入/削除） |
| 分析の修正（スコアが違う等） | `reviseRationale` → KPI widget 再表示 → 必要なら提案書も update |
| 「英語版も作って」 | 新規 `artifact create` で英語版を別 artifact として生成 |

---

## 重要ルール

### 提案書に含めてはいけないデータ（厳守）

以下は **社内分析用**（Phase 1 の show-widget でのみ表示）。提案書スライドには絶対に含めない:

- `winProbability`（受注確率）
- `dealHealthScore`（商談健全度）
- `proposalReadiness`（提案準備度）
- `activityScore`（活動スコア）
- `engagementLevel`（エンゲージメントレベル）
- `scenarios`（楽観/標準/悲観シナリオ）
- `keyDrivers`（成功要因）
- `riskFactors`（リスク要因）
- `proposalJudgment` / `proposalJudgmentReason`

### 提案書に含めるデータ

- `rationale.customerChallenges` → 「貴社の課題」セクション
- `rationale.serviceRecommendations` → 「ご提案ソリューション」セクション
- `rationale.combinedSolution` → 「総合ソリューション」セクション
- `rationale.expectedKPIs` → 「期待される効果」セクション
- `rationale.existingProposalHints` → 「ご提案のポイント」セクション
- `rationale.nextActions` → 「導入スケジュール」セクション
- CRM アカウント/商談データ → 「貴社について」セクション

### show-widget vs artifact の使い分け

| コンテンツ | ツール | 理由 |
|-----------|--------|------|
| KPI スコア・ゲージ | show-widget | 短い補助的な可視化、チャット内インライン |
| 要因バッジ・推奨アクション | show-widget | コンパクトなダッシュボード |
| 提案書スライド全体 | artifact (html) | 長文の成果物、反復編集、サイドパネル表示 |
| サービス推奨テーブル | Markdown | テキスト主体の一覧は Markdown が最適 |

---

## コンテンツ品質ルール

### スライドの言語

- **すべてのスライド見出し・セクションタイトルは日本語で書く**。英語の大文字見出し（CHALLENGES, SOLUTIONS 等）は使わない
- OK: 「貴社の課題」「ご提案ソリューション」「期待される効果」
- NG: 「CHALLENGES」「SOLUTIONS」「EXPECTED EFFECTS」
- サブテキスト、ラベル、説明文もすべて日本語。英語は固有名詞（製品名、技術用語）のみ

### 概算費用スライドのルール

`opportunity.Amount` が存在する場合、以下の構成で概算費用スライドを作成:

1. **投資規模の提示**: Amount を「概算投資額」として表示（¥ + 万/億単位）
2. **費用の内訳（推定）**: サービス別に割合を示す（例: プラットフォーム構築 60%, カスタマイズ 25%, 導入支援 15%）
3. **ROI の示唆**: 期待される効果と投資額を結びつける（例: 「年間 XX 万円の工数削減が見込まれ、約 N 年で投資回収」）
4. **注記**: 「本概算は現時点の想定です。詳細見積は要件定義後にご提示いたします」を必ず付記

Amount がない場合はこのスライドをスキップする。

### 効果指標の書き方（厳守）

「期待される効果」スライドでは:

- **具体的なパーセンテージ・数字を捏造してはいけない**。「80% 削減」「25% 短縮」「15% 向上」等の数値は **KB 検索結果や CRM データに明確な根拠がある場合のみ** 使用可。根拠なく具体数値を書くと顧客の信頼を失う
- 根拠がない場合は **定性的な表現のみ** 使う:
  - OK: 「業務効率の大幅な改善」「意思決定スピードの向上」「データ駆動型の運営が可能に」
  - OK: 「〜の効率化が期待されます」「〜の改善を目指します」
  - NG: 「80% 削減」「3倍の生産性」「ROI 200%」（根拠なし）
- Chart.js グラフを使う場合も同様 — 根拠のない数値でグラフを描かない。定性的な比較（現状 vs 導入後のイメージ図）は OK
- KB に導入事例や業界データがあれば、出典を明記して引用可

### スライド構成の柔軟性

SKILL.md のスライド構成表はガイドラインであり、案件の性質に応じて柔軟に調整してよい:

- **サポート体制スライド**: 長期契約や大型案件であれば追加してよい
- **事例紹介スライド**: KB に類似事例があれば追加してよい
- **技術構成スライド**: IT/DX 案件で技術的な顧客に対しては追加してよい
- 追加スライドは定義された構成の「Closing」の前に挿入する
