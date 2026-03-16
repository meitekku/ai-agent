import { Hono } from "hono";
import type { R } from "../lib/types";

const app = new Hono();

// Mock data
const MOCK_KINTONE_RECORDS: R[] = [
  {
    $id: { value: "KTN-1001" }, 案件名: { value: "基幹システムDX化プロジェクト" }, 会社名: { value: "株式会社セブン&アイ・ホールディングス" },
    金額: { value: "36000000" }, ステージ: { value: "提案中" }, 完了予定日: { value: "2026-07-31" }, 業種: { value: "小売・流通" },
    概要: { value: "店舗業務のデジタル化を推進。POSデータ分析AI、在庫管理の自動化、本部-店舗間のナレッジ共有システムを構築。" },
    確度: { value: "65" }, ネクストステップ: { value: "4月中旬にPoC環境の構築・テスト開始" },
  },
  {
    $id: { value: "KTN-1002" }, 案件名: { value: "社内FAQ AIチャットボット導入" }, 会社名: { value: "大和ハウス工業株式会社" },
    金額: { value: "9500000" }, ステージ: { value: "見積提示" }, 完了予定日: { value: "2026-05-31" }, 業種: { value: "建設・不動産" },
    概要: { value: "総務・人事・経理への社内問い合わせをAI RAG Agentで自動応答化。月間約3,000件のうち70%をAIで対応。" },
    確度: { value: "78" }, ネクストステップ: { value: "最終見積もりの承認待ち（部門長決裁）" },
  },
  {
    $id: { value: "KTN-1003" }, 案件名: { value: "製造現場ナレッジ継承AIシステム" }, 会社名: { value: "ダイキン工業株式会社" },
    金額: { value: "28000000" }, ステージ: { value: "交渉中" }, 完了予定日: { value: "2026-08-15" }, 業種: { value: "製造業" },
    概要: { value: "ベテラン技術者の退職に備え、製造ノウハウ・保守マニュアル・品質記録をAI RAG Agentで横断検索可能にする。" },
    確度: { value: "72" }, ネクストステップ: { value: "契約条件の最終調整（分割払い要望への対応）" },
  },
  {
    $id: { value: "KTN-1004" }, 案件名: { value: "営業会議録AI自動化サービス" }, 会社名: { value: "野村證券株式会社" },
    金額: { value: "14000000" }, ステージ: { value: "ニーズ把握" }, 完了予定日: { value: "2026-09-30" }, 業種: { value: "証券・金融" },
    概要: { value: "全国支店の営業会議・顧客商談の音声記録を書きあげクンで自動文字起こし・要約。" },
    確度: { value: "45" }, ネクストステップ: { value: "情報セキュリティ部門との要件確認ミーティング（4月上旬）" },
  },
  {
    $id: { value: "KTN-1005" }, 案件名: { value: "物流最適化×AI分析基盤構築" }, 会社名: { value: "ヤマトホールディングス株式会社" },
    金額: { value: "45000000" }, ステージ: { value: "提案中" }, 完了予定日: { value: "2026-10-31" }, 業種: { value: "物流・運輸" },
    概要: { value: "配送ルート最適化と倉庫オペレーションの効率化にAIを活用。" },
    確度: { value: "55" }, ネクストステップ: { value: "技術検証結果の社内共有（経営戦略会議 4月中旬）" },
  },
];

const MOCK_KINTONE_DETAIL: Record<string, R> = {
  "KTN-1001": {
    account: { Name: "株式会社セブン&アイ・ホールディングス", Industry: "小売・流通" },
    opportunity: { Id: "KTN-1001", Name: "基幹システムDX化プロジェクト", Amount: 36000000, StageName: "提案中", CloseDate: "2026-07-31", Probability: 65, Description: "店舗業務のデジタル化を推進。POSデータ分析AI、在庫管理の自動化、本部-店舗間のナレッジ共有システムを構築。", NextStep: "4月中旬にPoC環境の構築・テスト開始" },
    activities: [
      { Subject: "展示会での初回接触", ActivityDate: "2025-11-08", Type: "Event", Description: "リテールテックJAPANにて高田部長と名刺交換。" },
      { Subject: "初回訪問：課題ヒアリング", ActivityDate: "2025-12-02", Type: "Meeting", Description: "高田部長・山本課長と面談。現状：店舗報告書はFAXベース。" },
      { Subject: "電話：競合状況の確認", ActivityDate: "2025-12-20", Type: "Call", Description: "山本課長より、大手SIerがクラウドPOS提案中。" },
      { Subject: "2回目訪問：ソリューション方向性提示", ActivityDate: "2026-01-15", Type: "Meeting", Description: "3つの方向性を提示。" },
      { Subject: "PoC計画合意", ActivityDate: "2026-02-05", Type: "Meeting", Description: "都内10店舗でPoCを3週間実施で合意。" },
      { Subject: "PoC中間報告", ActivityDate: "2026-02-20", Type: "Meeting", Description: "利用率85%、質問応答精度91%。好感触。" },
      { Subject: "PoC最終報告", ActivityDate: "2026-03-05", Type: "Meeting", Description: "全店展開の正式提案を依頼された。" },
    ],
    contacts: [
      { Id: "1", LastName: "高田", FirstName: "誠一", Title: "情報システム部 部長（意思決定者）" },
      { Id: "2", LastName: "山本", FirstName: "真由美", Title: "情報システム部 課長（実務窓口）" },
      { Id: "3", LastName: "田村", FirstName: "浩二", Title: "店舗運営部 次長（利用部門代表）" },
    ],
  },
  "KTN-1002": {
    account: { Name: "大和ハウス工業株式会社", Industry: "建設・不動産" },
    opportunity: { Id: "KTN-1002", Name: "社内FAQ AIチャットボット導入", Amount: 9500000, StageName: "見積提示", CloseDate: "2026-05-31", Probability: 78, Description: "総務・人事・経理への社内問い合わせをAI RAG Agentで自動応答化。", NextStep: "最終見積もりの承認待ち（部門長決裁）" },
    activities: [
      { Subject: "Webからの問い合わせ対応", ActivityDate: "2025-12-20", Type: "Email" },
      { Subject: "初回オンライン面談", ActivityDate: "2026-01-08", Type: "Meeting" },
      { Subject: "PoC実施：就業規則FAQ 300件", ActivityDate: "2026-02-01", Type: "Meeting" },
      { Subject: "見積書・導入計画書の送付", ActivityDate: "2026-03-01", Type: "Email" },
      { Subject: "電話：決裁状況の確認", ActivityDate: "2026-03-10", Type: "Call" },
    ],
    contacts: [
      { Id: "1", LastName: "森本", FirstName: "直美", Title: "経営企画部 課長（推進者・窓口）" },
      { Id: "2", LastName: "西田", FirstName: "大輔", Title: "総務部 部長（利用部門代表）" },
    ],
  },
  "KTN-1003": {
    account: { Name: "ダイキン工業株式会社", Industry: "製造業" },
    opportunity: { Id: "KTN-1003", Name: "製造現場ナレッジ継承AIシステム", Amount: 28000000, StageName: "交渉中", CloseDate: "2026-08-15", Probability: 72, Description: "ベテラン技術者の退職に備え、製造ノウハウをAI RAG Agentで横断検索可能にする。", NextStep: "契約条件の最終調整（分割払い要望への対応）" },
    activities: [
      { Subject: "紹介経由の初回面談", ActivityDate: "2025-10-05", Type: "Meeting" },
      { Subject: "工場視察（堺製作所）", ActivityDate: "2025-11-12", Type: "Meeting" },
      { Subject: "PoC実施：保守マニュアル500件", ActivityDate: "2026-01-20", Type: "Meeting" },
      { Subject: "書きあげクンデモ", ActivityDate: "2026-02-10", Type: "Meeting" },
      { Subject: "提案書送付", ActivityDate: "2026-02-25", Type: "Email" },
      { Subject: "契約条件交渉", ActivityDate: "2026-03-05", Type: "Meeting" },
    ],
    contacts: [
      { Id: "1", LastName: "岡田", FirstName: "修平", Title: "生産技術本部 副本部長（意思決定者）" },
      { Id: "2", LastName: "谷口", FirstName: "和也", Title: "堺製作所 製造部長（現場代表）" },
      { Id: "3", LastName: "小松", FirstName: "幸子", Title: "品質管理部 課長" },
    ],
  },
  "KTN-1004": {
    account: { Name: "野村證券株式会社", Industry: "証券・金融" },
    opportunity: { Id: "KTN-1004", Name: "営業会議録AI自動化サービス", Amount: 14000000, StageName: "ニーズ把握", CloseDate: "2026-09-30", Probability: 45, Description: "全国支店の営業会議・顧客商談の音声記録を書きあげクンで自動文字起こし・要約。", NextStep: "情報セキュリティ部門との要件確認ミーティング（4月上旬）" },
    activities: [
      { Subject: "初回オンライン面談", ActivityDate: "2026-01-15", Type: "Meeting" },
      { Subject: "コンプライアンス部門ヒアリング", ActivityDate: "2026-02-05", Type: "Meeting" },
      { Subject: "電話：予算策定の状況確認", ActivityDate: "2026-03-01", Type: "Call" },
    ],
    contacts: [
      { Id: "1", LastName: "中島", FirstName: "健太", Title: "デジタル推進部 マネージャー（推進者）" },
      { Id: "2", LastName: "安藤", FirstName: "理恵", Title: "コンプライアンス部 課長" },
    ],
  },
  "KTN-1005": {
    account: { Name: "ヤマトホールディングス株式会社", Industry: "" },
    opportunity: { Name: "物流最適化×AI分析基盤構築", Amount: 0, StageName: "", CloseDate: "", Probability: 0, Description: "", NextStep: "" },
    activities: [],
    contacts: [],
  },
};

function getCredentials(body: R) {
  return {
    subdomain: body.credentials?.subdomain || process.env.KINTONE_SUBDOMAIN || "",
    apiToken: body.credentials?.apiToken || process.env.KINTONE_API_TOKEN || "",
    appId: body.credentials?.appId || process.env.KINTONE_APP_ID || "",
  };
}

async function kintoneRequest(creds: { subdomain: string; apiToken: string }, path: string): Promise<R> {
  const url = `https://${creds.subdomain}.cybozu.com/k/v1/${path}`;
  const res = await fetch(url, { headers: { "X-Cybozu-API-Token": creds.apiToken, "Content-Type": "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kintone API error (${res.status}): ${text}`);
  }
  return res.json();
}

app.post("/kintone/list", async (c) => {
  try {
    const body = await c.req.json();
    const creds = getCredentials(body);
    if (!creds.subdomain || !creds.apiToken || !creds.appId) {
      return c.json({ error: "Kintoneの接続情報が不足しています" }, 400);
    }
    try {
      const json = await kintoneRequest(creds, `records.json?app=${creds.appId}`);
      const records: R[] = json.records || [];
      const opportunities = records.slice(0, 50).map((r: R, i: number) => ({
        Id: r.$id?.value || String(i),
        Name: r["案件名"]?.value || r["商談名"]?.value || r["件名"]?.value || `レコード ${i + 1}`,
        Amount: parseFloat(r["金額"]?.value || r["予算"]?.value || "0") || 0,
        StageName: r["ステージ"]?.value || r["状況"]?.value || r["フェーズ"]?.value || "",
        CloseDate: r["完了予定日"]?.value || r["期限"]?.value || "",
        AccountName: r["会社名"]?.value || r["顧客名"]?.value || r["取引先"]?.value || "",
      }));
      return c.json({ opportunities });
    } catch {
      // Fallback to mock data
      const opportunities = MOCK_KINTONE_RECORDS.map((r) => ({
        Id: r.$id.value, Name: r.案件名.value, Amount: parseFloat(r.金額.value) || 0,
        StageName: r.ステージ.value, CloseDate: r.完了予定日.value, AccountName: r.会社名.value,
      }));
      return c.json({ opportunities });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `Kintone接続エラー: ${message}` }, 500);
  }
});

app.post("/kintone/fetch", async (c) => {
  try {
    const body = await c.req.json();
    const creds = getCredentials(body);
    const recordId = body.recordId;
    if (!recordId) return c.json({ error: "recordId が必要です" }, 400);
    if (!creds.subdomain || !creds.apiToken || !creds.appId) {
      return c.json({ error: "Kintoneの接続情報が不足しています" }, 400);
    }
    try {
      const json = await kintoneRequest(creds, `record.json?app=${creds.appId}&id=${recordId}`);
      const r = json.record || {};
      const data = {
        account: { Name: r["会社名"]?.value || r["顧客名"]?.value || "不明", Industry: r["業種"]?.value || r["業界"]?.value || "", Description: r["会社概要"]?.value || "" },
        opportunity: { Name: r["案件名"]?.value || r["商談名"]?.value || "不明", Amount: parseFloat(r["金額"]?.value || "0") || 0, StageName: r["ステージ"]?.value || "", CloseDate: r["完了予定日"]?.value || "", Description: r["概要"]?.value || "", Probability: parseFloat(r["確度"]?.value || "0") || 0, NextStep: r["ネクストステップ"]?.value || "" },
        activities: [],
        contacts: r["担当者"]?.value ? [{ Id: "1", Name: r["担当者"].value, LastName: r["担当者"].value, Title: r["担当者役職"]?.value || "" }] : [],
      };
      return c.json({ data });
    } catch {
      // Fallback to mock
      const mockDetail = MOCK_KINTONE_DETAIL[recordId];
      if (mockDetail) return c.json({ data: mockDetail });
      const firstDetail = Object.values(MOCK_KINTONE_DETAIL)[0];
      return c.json({ data: firstDetail });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `Kintone接続エラー: ${message}` }, 500);
  }
});

export default app;
