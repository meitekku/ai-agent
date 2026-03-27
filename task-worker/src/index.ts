import { Hono } from "hono";
import { logger } from "hono/logger";
import { ensureTables } from "./lib/db";
import health from "./routes/health";
import { startWorker } from "./lib/worker";

const app = new Hono();

app.use("*", logger());
app.route("/", health);

// Initialize DB tables on startup
ensureTables().catch((err) => {
  console.error("[task-worker] Failed to ensure tables:", err);
});

// Start the BRPOP consumer loop
startWorker().catch((err) => {
  console.error("[task-worker] Worker failed:", err);
});

const port = parseInt(process.env.PORT || "8010", 10);
console.log(`[task-worker] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
