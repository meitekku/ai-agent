import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "crm-service" }));

export default app;
