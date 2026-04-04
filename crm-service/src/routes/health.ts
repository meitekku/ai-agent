import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "crm-service" }));

app.get("/capabilities", (c) => {
  const sf = !!(process.env.SALESFORCE_INSTANCE_URL && process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
  const kintone = !!(process.env.KINTONE_SUBDOMAIN && process.env.KINTONE_API_TOKEN && process.env.KINTONE_APP_ID);
  return c.json({ salesforce: sf, kintone });
});

export default app;
