import { Hono } from "hono";
import { logger } from "hono/logger";
import { ensureCrmTables } from "./lib/db";
import { importKintoneIfEmpty } from "./lib/import-kintone";
import health from "./routes/health";
import salesforce from "./routes/salesforce";
import kintone from "./routes/kintone";
import parseFile from "./routes/parse-file";
import analyze from "./routes/analyze";
import rationale from "./routes/rationale";
import solutionQa from "./routes/solution-qa";
import templates from "./routes/templates";
import proposalPptx from "./routes/proposal-pptx";

const app = new Hono();

app.use("*", logger());

// Mount all routes
app.route("/", health);
app.route("/", salesforce);
app.route("/", kintone);
app.route("/", parseFile);
app.route("/", analyze);
app.route("/", rationale);
app.route("/", solutionQa);
app.route("/", templates);
app.route("/", proposalPptx);

// Initialize DB tables + import seed data on startup
ensureCrmTables()
  .then(() => importKintoneIfEmpty("/app/data/kintone-deals.csv"))
  .catch((err) => {
    console.error("[crm-service] Failed to initialize:", err);
  });

const port = parseInt(process.env.PORT || "8009", 10);
console.log(`[crm-service] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
