import { Hono } from "hono";
import { logger } from "hono/logger";
import { ensureTables } from "./lib/db";
import health from "./routes/health";
import { startWorker } from "./lib/worker";

const app = new Hono();

app.use("*", logger());
app.route("/", health);

// Initialize DB tables, then start the BRPOP consumer loop
ensureTables()
  .then(() => startWorker())
  .catch((err) => {
    console.error("[task-worker] Startup failed:", err);
  });

const port = parseInt(process.env.PORT || "8010", 10);
console.log(`[task-worker] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
