import { Hono } from "hono";
import { getPool } from "../lib/db";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "crm-service" }));

// Cached — kintone data presence only changes at startup (one-time CSV import)
let kintoneDataCached: boolean | null = null;

app.get("/capabilities", async (c) => {
  const sf = !!(process.env.SALESFORCE_INSTANCE_URL && process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
  const kintoneEnv = !!(process.env.KINTONE_SUBDOMAIN && process.env.KINTONE_API_TOKEN && process.env.KINTONE_APP_ID);

  let kintone = kintoneEnv;
  if (!kintone) {
    if (kintoneDataCached === null) {
      try {
        const { rows } = await getPool().query("SELECT EXISTS(SELECT 1 FROM kintone_deals LIMIT 1) AS has_data");
        kintoneDataCached = rows[0]?.has_data ?? false;
      } catch {
        kintoneDataCached = false;
      }
    }
    kintone = kintoneDataCached ?? false;
  }

  return c.json({ salesforce: sf, kintone });
});

export default app;
