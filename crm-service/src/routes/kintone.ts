import { Hono } from "hono";
import { getPool } from "../lib/db";
import type { R } from "../lib/types";

const app = new Hono();

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

// ---- /kintone/list — DB fallback when no credentials ----

async function listFromDb() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT d.record_number, d.deal_name, d.company_name, d.expected_period,
           d.industry, d.product,
           a.status AS latest_status,
           COALESCE(a.expected_amount, 0) AS latest_amount,
           COALESCE(a.order_amount, 0) AS order_amount,
           a.win_probability
    FROM kintone_deals d
    LEFT JOIN LATERAL (
      SELECT status, expected_amount, order_amount, win_probability
      FROM kintone_activities
      WHERE deal_id = d.id AND status IS NOT NULL AND status != ''
      ORDER BY activity_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) a ON TRUE
    ORDER BY d.record_number DESC
  `);
  return rows.map((r) => ({
    Id: String(r.record_number),
    Name: r.deal_name || "",
    Amount: r.order_amount > 0 ? Number(r.order_amount) : Number(r.latest_amount),
    StageName: r.latest_status || "",
    CloseDate: r.expected_period || "",
    AccountName: r.company_name || "",
  }));
}

app.post("/kintone/list", async (c) => {
  try {
    const body = await c.req.json();
    const creds = getCredentials(body);

    // Try live Kintone API if credentials exist
    if (creds.subdomain && creds.apiToken && creds.appId) {
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
      } catch (err) {
        console.warn("[kintone] Live API failed, falling back to DB:", (err as Error).message);
      }
    }

    // Fallback: query PostgreSQL
    const opportunities = await listFromDb();
    return c.json({ opportunities });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `Kintone接続エラー: ${message}` }, 500);
  }
});

// ---- /kintone/fetch — DB fallback when no credentials ----

function parseProbability(v: string): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function mapActivityType(status: string): string {
  switch (status) {
    case "初回訪問": case "提案": case "契約": return "Meeting";
    case "見積": return "Email";
    case "引き合い": return "Call";
    case "受注": case "失注": return "Event";
    default: return "Other";
  }
}

async function fetchFromDb(recordId: string) {
  const pool = getPool();
  const dealRes = await pool.query(
    "SELECT * FROM kintone_deals WHERE record_number = $1",
    [parseInt(recordId, 10)],
  );
  if (dealRes.rows.length === 0) return null;

  const deal = dealRes.rows[0];
  const actRes = await pool.query(
    "SELECT * FROM kintone_activities WHERE deal_id = $1 ORDER BY activity_date ASC NULLS FIRST, id ASC",
    [deal.id],
  );
  const activities = actRes.rows;

  // Latest activity with status
  const latestWithStatus = activities.findLast((a) => a.status);
  const latestAmount = latestWithStatus
    ? (Number(latestWithStatus.order_amount) > 0 ? Number(latestWithStatus.order_amount) : Number(latestWithStatus.expected_amount))
    : 0;

  // Build contacts from sales_rep + internal_members across activities
  const contactSet = new Set<string>();
  if (deal.sales_rep) contactSet.add(deal.sales_rep);
  for (const a of activities) {
    if (a.internal_members) {
      a.internal_members.split(/[,、\n]/).forEach((m: string) => {
        const trimmed = m.trim();
        if (trimmed) contactSet.add(trimmed);
      });
    }
  }
  const contacts = Array.from(contactSet).map((name, i) => ({
    Id: String(i + 1),
    LastName: name,
    FirstName: "",
    Title: i === 0 ? "営業担当者" : "社内関係者",
  }));

  return {
    account: {
      Name: deal.company_name || "",
      Industry: deal.industry || "",
      Description: [deal.customer_rank, deal.address].filter(Boolean).join("、"),
    },
    opportunity: {
      Id: String(deal.record_number),
      Name: deal.deal_name || "",
      Amount: latestAmount,
      StageName: latestWithStatus?.status || "",
      CloseDate: deal.expected_period || "",
      Probability: parseProbability(latestWithStatus?.win_probability || ""),
      Description: [
        deal.product ? `販売品目: ${deal.product}` : "",
        latestWithStatus?.notes ? latestWithStatus.notes.slice(0, 500) : "",
      ].filter(Boolean).join("\n"),
      CreatedDate: deal.created_at_kintone ? new Date(deal.created_at_kintone).toISOString() : "",
      NextStep: activities.length > 0
        ? (activities[activities.length - 1].notes || activities[activities.length - 1].activity_type || "").slice(0, 200)
        : "",
    },
    activities: activities.map((a) => ({
      Subject: a.activity_type || a.status || "",
      ActivityDate: a.activity_date ? new Date(a.activity_date).toISOString().split("T")[0] : "",
      Type: mapActivityType(a.status || ""),
      Description: a.notes || "",
    })),
    contacts,
  };
}

app.post("/kintone/fetch", async (c) => {
  try {
    const body = await c.req.json();
    const creds = getCredentials(body);
    const recordId = body.recordId;
    if (!recordId) return c.json({ error: "recordId が必要です" }, 400);

    // Try live Kintone API if credentials exist
    if (creds.subdomain && creds.apiToken && creds.appId) {
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
      } catch (err) {
        console.warn("[kintone] Live API failed, falling back to DB:", (err as Error).message);
      }
    }

    // Fallback: query PostgreSQL
    const data = await fetchFromDb(recordId);
    if (!data) {
      return c.json({ error: `レコード ${recordId} が見つかりません` }, 404);
    }
    return c.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `Kintone接続エラー: ${message}` }, 500);
  }
});

export default app;
