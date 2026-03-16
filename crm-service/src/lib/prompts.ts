import type { SFData, AnalysisResult, R } from "./types";

export function buildRationalePrompt(data: SFData, availableTemplateServices: string[]): string {
  const parts: string[] = [`顧客情報:
- 会社名: ${data.account.Name || "不明"}
- 業界: ${data.account.Industry || "未設定"}
- 商談名: ${data.opportunity.Name || "不明"}
- 説明: ${data.opportunity.Description || "なし"}
- 予算（金額）: ${data.opportunity.Amount ? `${data.opportunity.Amount.toLocaleString()}円` : "未設定"}
- ステージ: ${data.opportunity.StageName || "未設定"}`];

  if (data.activities?.length > 0) {
    parts.push(`活動記録（${data.activities.length}件）: ${data.activities.slice(0, 5).map((a: R) => a.Subject || a.Description || "").filter(Boolean).join("、") || "詳細なし"}`);
  }
  if (data.cases && data.cases.length > 0) {
    parts.push(`問い合わせ（${data.cases.length}件）: ${data.cases.slice(0, 3).map((c: R) => c.Subject || "").filter(Boolean).join("、")}`);
  }
  if (data.feedItems && data.feedItems.length > 0) {
    parts.push(`Chatter/日報: ${data.feedItems.slice(0, 3).map((f: R) => (f.Body || "").slice(0, 100)).filter(Boolean).join(" / ")}`);
  }
  if (data.emails && data.emails.length > 0) {
    parts.push(`メール件名: ${data.emails.slice(0, 5).map((e: R) => e.Subject || "").filter(Boolean).join("、")}`);
  }

  const templateSection = availableTemplateServices.length > 0
    ? `## 社内にアップロード済みの紹介資料・提案書テンプレート\n${availableTemplateServices.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : `## 社内にアップロード済みの紹介資料・提案書テンプレート\n（現在アップロードなし）`;

  return `以下の顧客データを分析し、JSON形式で回答してください。

${parts.join("\n")}

## 弊社の製品・サービス
1. **DX開発サービス**: カスタムDXソリューション設計・開発、レガシーシステム刷新、業務プロセス自動化、API連携、Web/モバイルアプリ開発、データ基盤構築
2. **AI RAG Agent**: RAGベースのAI質問応答システム、社内ナレッジ検索、ドキュメント自動分類・検索、商談分析・提案書自動生成
3. **書きあげクン**: AI音声文字起こし、会議録・議事録自動作成、多言語対応、要約・キーポイント抽出

${templateSection}

## 提案判定ルール（proposalJudgment）
以下の優先順位で判定してください：

1. **"existing_service"**（既存サービスで対応可能）
   - 上記のアップロード済みテンプレートの中に、顧客の課題・ニーズに合致するサービスが存在する場合

2. **"dx_development"**（DX新規開発を推薦）
   - 既存テンプレートに合致するサービスがない、またはテンプレートが未アップロードの場合
   - ただし、顧客の予算・規模・課題がDX新規開発で対応可能な範囲であること
   - 目安：予算が100万円以上、または明確な業務課題がある場合

3. **"not_proposable"**（提案不可）
   - 顧客の予算が極端に低く（目安：10万円未満）かつ要件が大規模・複雑な場合
   - 顧客の業界・規制上の制約でサービス提供が困難な場合
   - 技術的・物理的に実現不可能な要件がある場合

## 回答形式（JSON以外のテキストは一切不要）
{
  "customerChallenges": ["顧客の具体的な課題1", "課題2", "課題3"],
  "serviceRecommendations": [
    {
      "service": "サービス名（DX開発サービス/AI RAG Agent/書きあげクン）",
      "relevance": "primary/secondary/optional",
      "reason": "この顧客にこのサービスを推薦する具体的な理由",
      "features": ["活用する具体的な機能1", "機能2"]
    }
  ],
  "combinedSolution": "複数サービスを組み合わせた包括的なソリューションの説明（2〜3文）",
  "existingProposalHints": ["提案書に含めるべきポイント1", "ポイント2", "ポイント3"],
  "proposalJudgment": "existing_service または dx_development または not_proposable",
  "proposalJudgmentReason": "判定の根拠を1〜2文で説明"
}`;
}

export function buildRevisionPrompt(analysis: AnalysisResult, feedback: string): string {
  const r = analysis.rationale;
  return `あなたはDXソリューション企業の法人営業コンサルタントです。
以下の分析結果と分析根拠に対して、ユーザーから補足・修正のフィードバックがありました。
フィードバックの内容を反映して、分析根拠および分析結果を修正してください。

## 現在の分析結果
- 受注確度: ${analysis.winProbability}%
- 商談健全度: ${analysis.dealHealthScore}/100
- 活動スコア: ${analysis.activityScore}/100
- エンゲージメント: ${analysis.engagementLevel}
- 提案準備度: ${analysis.proposalReadiness}/100
- 主要成功要因: ${analysis.keyDrivers.join("、")}
- リスク要因: ${analysis.riskFactors.join("、")}
- 推奨アクション: ${analysis.recommendedActions.join("、")}

### シナリオ
- 楽観: ${analysis.scenarios.optimistic.label}（確率${analysis.scenarios.optimistic.probability}%）
- 基本: ${analysis.scenarios.base.label}（確率${analysis.scenarios.base.probability}%）
- 悲観: ${analysis.scenarios.pessimistic.label}（確率${analysis.scenarios.pessimistic.probability}%）

## 現在の分析根拠
### 顧客の課題
${r.customerChallenges.map((c, i) => `${i + 1}. ${c}`).join("\n")}

### 推薦サービス
${r.serviceRecommendations.map((s) => `- ${s.service}（${s.relevance}）: ${s.reason}\n  機能: ${s.features.join("、")}`).join("\n")}

### 総合ソリューション
${r.combinedSolution}

### 提案書に含めるべきポイント
${r.existingProposalHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}

## ユーザーからのフィードバック
${feedback}

## 弊社の製品・サービス
1. **DX開発サービス**: カスタムDXソリューション設計・開発、レガシーシステム刷新、業務プロセス自動化、API連携、Web/モバイルアプリ開発、データ基盤構築
2. **AI RAG Agent**: RAGベースのAI質問応答システム、社内ナレッジ検索、ドキュメント自動分類・検索、商談分析・提案書自動生成
3. **書きあげクン**: AI音声文字起こし、会議録・議事録自動作成、多言語対応、要約・キーポイント抽出

## 指示
- フィードバックの内容を正確に反映してください
- 誤りの指摘があれば修正してください
- 補足情報があれば取り入れて内容を充実させてください
- 削除の指示があれば該当項目を削除してください
- **推薦サービスは、フィードバック内容に応じて追加・削除・変更してください**
- **分析結果（受注確度、スコア、シナリオ等）もフィードバック内容に応じて適切に更新してください**
- フィードバックに関係ない部分はそのまま維持してください

## 回答形式（JSON以外のテキストは一切返さないでください）
{
  "rationale": {
    "customerChallenges": ["修正後の課題1", "課題2", "課題3"],
    "serviceRecommendations": [
      {
        "service": "サービス名（DX開発サービス/AI RAG Agent/書きあげクン）",
        "relevance": "primary/secondary/optional",
        "reason": "修正後の推薦理由",
        "features": ["機能1", "機能2"]
      }
    ],
    "combinedSolution": "修正後の総合ソリューション説明",
    "existingProposalHints": ["修正後のポイント1", "ポイント2"]
  },
  "analysisUpdates": {
    "winProbability": 75,
    "dealHealthScore": 70,
    "activityScore": 60,
    "engagementLevel": "高",
    "proposalReadiness": 65,
    "keyDrivers": ["要因1", "要因2"],
    "riskFactors": ["リスク1", "リスク2"],
    "recommendedActions": ["アクション1", "アクション2"],
    "scenarios": {
      "optimistic": { "label": "楽観シナリオ", "probability": 30, "expectedRevenue": 5000000, "timeline": "3ヶ月", "conditions": ["条件1"] },
      "base": { "label": "基本シナリオ", "probability": 50, "expectedRevenue": 3000000, "timeline": "6ヶ月", "conditions": ["条件1"] },
      "pessimistic": { "label": "悲観シナリオ", "probability": 20, "expectedRevenue": 1000000, "timeline": "12ヶ月", "conditions": ["条件1"] }
    }
  }
}`;
}

export function buildPptxPrompt(data: SFData, analysis: AnalysisResult, templateContent: string): string {
  const sections: string[] = [];

  function fmtAmount(amt: number): string {
    if (!amt) return "¥0";
    if (amt >= 100000000) return `¥${(amt / 100000000).toFixed(1)}億`;
    if (amt >= 10000) return `¥${(amt / 10000).toFixed(0)}万`;
    return `¥${amt.toLocaleString()}`;
  }

  function formatContacts(contacts: R[]): string {
    if (!contacts || contacts.length === 0) return "なし";
    return contacts.slice(0, 5).map((c) => `${c.LastName || ""}${c.FirstName || ""}（${c.Title || "役職不明"}）`).join("、");
  }

  function summarizeRecords(records: R[] | undefined, fields: string[], maxItems = 10): string {
    if (!records || records.length === 0) return "なし";
    return records.slice(0, maxItems).map((r) =>
      fields.map((f) => `${f}: ${r[f] || ""}`).join(" / "),
    ).join("\n  ");
  }

  sections.push(`## 商談データ
- 顧客名: ${data.account.Name || "不明"} / 業界: ${data.account.Industry || "未設定"}
- 商談名: ${data.opportunity.Name || "不明"} / 金額: ${fmtAmount(data.opportunity.Amount ?? 0)}
- ステージ: ${data.opportunity.StageName || "未設定"} / クローズ予定: ${data.opportunity.CloseDate || "未設定"}
- 確度: ${data.opportunity.Probability || 0}% / 説明: ${data.opportunity.Description || "なし"}
- ネクストステップ: ${data.opportunity.NextStep || "なし"}
- コンタクト: ${formatContacts(data.contacts)}`);

  if (data.activities?.length > 0) {
    sections.push(`## 活動記録（${data.activities.length}件）\n  ${summarizeRecords(data.activities, ["Subject", "ActivityDate", "Status", "Type"], 15)}`);
  }
  if (data.events?.length > 0) {
    sections.push(`## 会議・訪問（${data.events.length}件）\n  ${summarizeRecords(data.events, ["Subject", "StartDateTime", "Location", "Type"], 10)}`);
  }
  if (data.feedItems?.length > 0) {
    sections.push(`## Chatter投稿・日報（${data.feedItems.length}件）\n  ${data.feedItems.slice(0, 10).map((f: R) => `[${f.CreatedDate || ""}] ${(f.Body || "").slice(0, 200)}`).join("\n  ")}`);
  }
  if (data.notes?.length > 0) {
    sections.push(`## メモ・ノート（${data.notes.length}件）\n  ${data.notes.slice(0, 8).map((n: R) => `[${n.CreatedDate || ""}] ${n.Title || ""}: ${(n.Body || "").slice(0, 150)}`).join("\n  ")}`);
  }
  if (data.cases?.length > 0) {
    sections.push(`## 問い合わせ履歴（${data.cases.length}件）\n  ${summarizeRecords(data.cases, ["Subject", "Status", "Priority", "CreatedDate"], 10)}`);
  }
  if (data.contracts?.length > 0) {
    sections.push(`## 契約情報（${data.contracts.length}件）\n  ${summarizeRecords(data.contracts, ["ContractNumber", "Status", "StartDate", "EndDate"], 5)}`);
  }
  if (data.quotes?.length > 0) {
    sections.push(`## 見積（${data.quotes.length}件）\n  ${data.quotes.slice(0, 5).map((q: R) => `${q.Name}: ${fmtAmount(q.TotalPrice)} (${q.Status})`).join("\n  ")}`);
  }
  if (data.lineItems?.length > 0) {
    sections.push(`## 商談製品（${data.lineItems.length}件）\n  ${data.lineItems.slice(0, 10).map((l: R) => `${l.Name}: ${l.Quantity}個 × ${fmtAmount(l.UnitPrice)} = ${fmtAmount(l.TotalPrice)}`).join("\n  ")}`);
  }
  if (data.emails?.length > 0) {
    sections.push(`## メール履歴（${data.emails.length}件）\n  ${data.emails.slice(0, 8).map((e: R) => `[${e.Date || ""}] ${e.Subject || ""}`).join("\n  ")}`);
  }

  sections.push(`## 分析結果
- 受注確率: ${analysis.winProbability}%
- ディールスコア: ${analysis.dealHealthScore}/100
- エンゲージメント: ${analysis.engagementLevel}
- キードライバー: ${analysis.keyDrivers.join("、")}
- リスク要因: ${analysis.riskFactors.join("、")}
- 推奨アクション: ${analysis.recommendedActions.join("、")}
- シナリオ楽観: 確率${Math.round(analysis.scenarios.optimistic.probability * 100)}% 金額${fmtAmount(analysis.scenarios.optimistic.expectedRevenue)}
- シナリオ標準: 確率${Math.round(analysis.scenarios.base.probability * 100)}% 金額${fmtAmount(analysis.scenarios.base.expectedRevenue)}
- シナリオ悲観: 確率${Math.round(analysis.scenarios.pessimistic.probability * 100)}% 金額${fmtAmount(analysis.scenarios.pessimistic.expectedRevenue)}`);

  if (analysis.rationale) {
    const r = analysis.rationale;
    const rationaleLines: string[] = ["## 分析根拠（提案書の核となる内容 — 必ず提案書に反映すること）"];
    if (r.customerChallenges.length > 0) rationaleLines.push(`### 顧客の課題\n${r.customerChallenges.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
    if (r.serviceRecommendations.length > 0) rationaleLines.push(`### 推薦サービス\n${r.serviceRecommendations.map((s) => `- **${s.service}**（${s.relevance}）: ${s.reason}\n  活用機能: ${s.features.join("、")}`).join("\n")}`);
    if (r.combinedSolution) rationaleLines.push(`### 総合ソリューション\n${r.combinedSolution}`);
    if (r.existingProposalHints.length > 0) rationaleLines.push(`### 提案書に含めるべきポイント\n${r.existingProposalHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`);
    sections.push(rationaleLines.join("\n\n"));
  }

  return `あなたはプレゼンテーションデザイナーです。以下の顧客の全情報と分析結果・分析根拠に基づいて、提案書のスライド構成をJSON形式で設計してください。

${sections.join("\n\n")}
${templateContent}

## 要件
商談の内容・規模・業界に合わせて最適なスライド構成を自由に設計してください。

### ルール
1. スライド数は5〜12枚で商談の複雑さに応じて調整
2. 各スライドに適切なレイアウト（title/content/two-column/cards/closing）を選択
3. テーマカラーは業界・顧客イメージに合わせて選択（6桁hex、#なし）
4. elementsの座標はインチ単位（スライドは10x5.625）
5. 文章は日本語で、商談固有の内容を盛り込む
6. KPI、リスト、テーブル、テキストを効果的に組み合わせる

### 提案書の品質基準
- 顧客視点で構成する：「あなたの課題 → 私たちの解決策 → 導入効果」の流れ
- 数値・根拠で説得力を持たせる（ROI試算、コスト比較、導入効果の具体例）
- 各スライドに明確な目的を持たせ、冗長な情報は省く

### element types
- **text**: 自由テキスト。content, fontSize, bold, italic, color, align, valign
- **shape**: 装飾用矩形。fill, borderColor
- **list**: 箇条書き。items[], fontSize, color
- **kpi**: 数値カード。label, value, valueColor, fill
- **table**: テーブル。rows[][]（1行目がヘッダー）, headerBg

### JSON形式（これ以外のテキストは一切返さないでください）
{
  "theme": {
    "primary": "1E2761",
    "secondary": "2D4A8A",
    "accent": "0891B2",
    "background": "F5F7FA",
    "text": "2C3E50",
    "lightText": "64748B"
  },
  "slides": [
    {
      "title": "スライドタイトル",
      "subtitle": "サブタイトル（任意）",
      "layout": "title",
      "bgColor": "1E2761",
      "headerColor": "FFFFFF",
      "elements": [
        { "type": "text", "x": 0.5, "y": 2, "w": 9, "h": 1, "content": "本文", "fontSize": 18, "color": "FFFFFF" }
      ]
    }
  ]
}`;
}

export const SOLUTION_QA_SYSTEM_PROMPT = `あなたは弊社（DXソリューション企業）の法人営業ソリューションコンサルタントです。
顧客の既存商談データや新規商談情報をもとに、以下の流れで分析・提案を行ってください：

1. **現状分析**: 商談データから顧客の課題・ニーズを特定
2. **解決策提案**: 課題に対する具体的な解決方法を詳しく説明
3. **自社製品・サービス推薦**: 弊社のソリューションを中心に推薦（下記の製品ラインナップ参照）
4. **アクションプラン**: 具体的な次のステップを提示

## 弊社の製品・サービスラインナップ（優先的に推薦すること）

### 1. DX開発サービス
- カスタムDXソリューションの設計・開発・導入支援
- レガシーシステムのモダナイゼーション、クラウド移行
- 業務プロセスのデジタル化・自動化（RPA、ワークフロー等）
- システムインテグレーション、API連携開発
- UI/UXデザイン、Webアプリ・モバイルアプリ開発
- データ基盤構築、BI・ダッシュボード開発

### 2. AI RAG Agent（本製品）
- RAG（Retrieval-Augmented Generation）ベースのAIエージェント
- 社内文書・ナレッジベースを活用したAI質問応答システム
- ドキュメントのアップロード → 自動分類 → チャンキング → 検索 → AI回答
- マルチモーダル対応（PDF、画像、テキスト等）
- カスタマイズ可能なプロンプト・ワークフロー
- 商談分析・提案書自動生成機能（本Q&A機能を含む）

### 3. 書きあげクン（文字起こし製品）
- 高精度AI音声文字起こしサービス
- 会議録・議事録の自動作成
- 多言語対応（日本語・英語等）
- リアルタイム文字起こし対応
- 要約・キーポイント抽出機能

## 推薦ルール
- 顧客の課題に対して、まず弊社の製品・サービスで解決できる部分を提案する
- 複数の製品を組み合わせた包括的なソリューションを提示する
- 弊社製品では対応しきれない部分がある場合のみ、補完的に他社ツールを紹介する
- コスト面でも弊社サービスの優位性をアピールする
- 導入事例や活用シナリオを具体的に記載する

回答は日本語で、構造化して分かりやすく記載してください。
Markdownフォーマット（見出し、箇条書き、太字等）を使って読みやすくしてください。
不明点がある場合は質問してください。`;

export function buildDetectPrompt(
  fileName: string,
  fileContent: string,
  existingTemplates: { name: string; serviceName: string; snippet: string }[],
): string {
  let existingSection = "";
  if (existingTemplates.length > 0) {
    existingSection = `\n\n## 既存のテンプレート\n${existingTemplates.map((t) =>
      `- ファイル名: ${t.name} / サービス名: ${t.serviceName || "未設定"}${t.snippet ? `\n  内容: ${t.snippet.slice(0, 200)}` : ""}`,
    ).join("\n")}`;
  }

  return `以下のファイルの内容からサービス名を判定し、既存テンプレートとの類似性をチェックしてください。

## アップロードされたファイル
ファイル名: ${fileName}
${fileContent ? `内容:\n${fileContent}` : "（バイナリファイルのため内容は読めません。ファイル名から判定してください）"}
${existingSection}

## 弊社のサービス一覧
1. DX開発サービス
2. AI RAG Agent
3. 書きあげクン
4. その他（上記に該当しない場合、提案内容から適切なサービス名を提案）

## 回答形式（JSON以外のテキストは一切返さないでください）
{
  "serviceName": "判定されたサービス名",
  "confidence": "high/medium/low",
  "similarTo": "類似する既存テンプレートのファイル名（なければnull）",
  "similarityReason": "類似の理由（なければnull）"
}`;
}
