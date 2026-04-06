import * as XLSX from "xlsx";
import { getPool } from "./db";
import { existsSync, readFileSync } from "fs";

/**
 * Column indices in the Kintone CSV export:
 *  0: レコードの開始行 (* = new record start)
 *  1: レコード番号       2: 会社名        3: TEL
 *  4: 営業担当者名       5: 見込み時期(deal)  6: 業界
 *  7: 顧客ランク         8: 住所           9: 案件名(deal)
 * 10: 更新者            11: 作成者        12: 更新日時
 * 13: 作成日時          14: 案件名(activity) 15: 活動日
 * 16: 新規/既存[新規]   17: 新規/既存[既存]  18: 先方担当部署名
 * 19: 社内関係者        20: 販売品目      21: ステータス
 * 22: 活動内容          23: 文字列(複数行) 24: 受注確度
 * 25: 見込み時期(activity) 26: 見込額      27: 受注金額
 */

interface DealRow {
  recordNumber: number;
  companyName: string;
  tel: string;
  salesRep: string;
  expectedPeriod: string;
  industry: string;
  customerRank: string;
  address: string;
  dealName: string;
  updatedBy: string;
  createdBy: string;
  updatedAt: string;
  createdAt: string;
  product: string;
}

interface ActivityRow {
  activityDate: string;
  isNew: boolean;
  isExisting: boolean;
  contactDepartment: string;
  internalMembers: string;
  status: string;
  activityType: string;
  notes: string;
  winProbability: string;
  expectedPeriod: string;
  expectedAmount: number;
  orderAmount: number;
}

interface DealGroup {
  deal: DealRow;
  activities: ActivityRow[];
}

function parseAmount(v: unknown): number {
  if (!v) return 0;
  const s = String(v).replace(/[,，円¥\s]/g, "");
  return parseInt(s, 10) || 0;
}

function parseKintoneDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // 2026/3/12 9:55 → 2026-03-12T09:55:00
  const m = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (h && mi) return `${date}T${h.padStart(2, "0")}:${mi.padStart(2, "0")}:00`;
  return date;
}

function parseCsv(filePath: string): DealGroup[] {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  if (rows.length < 2) return [];

  const groups: DealGroup[] = [];
  let current: DealGroup | null = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;

    const startMarker = String(r[0] || "").trim();
    const recordNum = parseInt(String(r[1] || ""), 10);

    // New record group
    if (startMarker === "*" && !isNaN(recordNum)) {
      if (current) groups.push(current);
      current = {
        deal: {
          recordNumber: recordNum,
          companyName: String(r[2] || ""),
          tel: String(r[3] || ""),
          salesRep: String(r[4] || ""),
          expectedPeriod: String(r[5] || ""),
          industry: String(r[6] || ""),
          customerRank: String(r[7] || ""),
          address: String(r[8] || ""),
          dealName: String(r[9] || ""),
          updatedBy: String(r[10] || ""),
          createdBy: String(r[11] || ""),
          updatedAt: String(r[12] || ""),
          createdAt: String(r[13] || ""),
          product: String(r[20] || ""),
        },
        activities: [],
      };
    }

    // Activity row (for both start rows and continuation rows)
    if (current) {
      const actDate = String(r[15] || "").trim();
      const status = String(r[21] || "").trim();
      // Skip rows with no activity data
      if (actDate || status) {
        current.activities.push({
          activityDate: actDate,
          isNew: String(r[16] || "").trim() === "1",
          isExisting: String(r[17] || "").trim() === "1",
          contactDepartment: String(r[18] || ""),
          internalMembers: String(r[19] || ""),
          status,
          activityType: String(r[22] || ""),
          notes: String(r[23] || ""),
          winProbability: String(r[24] || ""),
          expectedPeriod: String(r[25] || ""),
          expectedAmount: parseAmount(r[26]),
          orderAmount: parseAmount(r[27]),
        });
      }
    }
  }
  if (current) groups.push(current);

  return groups;
}

export async function importKintoneIfEmpty(csvPath: string): Promise<void> {
  if (!existsSync(csvPath)) {
    console.log(`[kintone-import] CSV not found: ${csvPath}, skipping`);
    return;
  }

  const pool = getPool();

  // Check if data already exists
  const { rows } = await pool.query("SELECT count(*)::int AS cnt FROM kintone_deals");
  if (rows[0].cnt > 0) {
    console.log(`[kintone-import] Already have ${rows[0].cnt} deals, skipping import`);
    return;
  }

  console.log(`[kintone-import] Parsing CSV: ${csvPath}`);
  const groups = parseCsv(csvPath);
  if (groups.length === 0) {
    console.log("[kintone-import] No records found in CSV");
    return;
  }

  await importGroups(pool, groups);
}

async function importGroups(pool: ReturnType<typeof getPool>, groups: DealGroup[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let dealCount = 0;
    let actCount = 0;

    for (const g of groups) {
      const d = g.deal;
      const res = await client.query(
        `INSERT INTO kintone_deals
          (record_number, company_name, deal_name, tel, sales_rep, expected_period,
           industry, customer_rank, address, product, created_by, updated_by,
           created_at_kintone, updated_at_kintone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (record_number) DO UPDATE SET
           company_name=EXCLUDED.company_name, deal_name=EXCLUDED.deal_name,
           tel=EXCLUDED.tel, sales_rep=EXCLUDED.sales_rep, expected_period=EXCLUDED.expected_period,
           industry=EXCLUDED.industry, customer_rank=EXCLUDED.customer_rank,
           address=EXCLUDED.address, product=EXCLUDED.product,
           created_by=EXCLUDED.created_by, updated_by=EXCLUDED.updated_by,
           created_at_kintone=EXCLUDED.created_at_kintone, updated_at_kintone=EXCLUDED.updated_at_kintone
         RETURNING id`,
        [
          d.recordNumber, d.companyName, d.dealName, d.tel, d.salesRep, d.expectedPeriod,
          d.industry, d.customerRank, d.address, d.product, d.createdBy, d.updatedBy,
          parseKintoneDate(d.createdAt), parseKintoneDate(d.updatedAt),
        ],
      );
      const dealId = res.rows[0].id;
      dealCount++;

      // Delete existing activities for this deal (for idempotent re-import)
      await client.query("DELETE FROM kintone_activities WHERE deal_id = $1", [dealId]);

      for (const a of g.activities) {
        await client.query(
          `INSERT INTO kintone_activities
            (deal_id, activity_date, is_new, is_existing, contact_department, internal_members,
             status, activity_type, notes, win_probability, expected_period,
             expected_amount, order_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            dealId,
            parseKintoneDate(a.activityDate),
            a.isNew, a.isExisting, a.contactDepartment, a.internalMembers,
            a.status, a.activityType, a.notes, a.winProbability, a.expectedPeriod,
            a.expectedAmount, a.orderAmount,
          ],
        );
        actCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`[kintone-import] Imported ${dealCount} deals, ${actCount} activities`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[kintone-import] Import failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
