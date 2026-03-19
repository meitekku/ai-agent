import { Hono } from "hono";
import { getPool } from "../lib/db";
import { generateText } from "../lib/gemini";
import { buildDetectPrompt } from "../lib/prompts";

const app = new Hono();

app.get("/templates", async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, name, service_name, file_size, updated_at FROM proposal_templates ORDER BY updated_at DESC",
    );
    const templates = result.rows.map((r) => ({
      id: r.id, name: r.name, serviceName: r.service_name || "",
      size: r.file_size, modified: r.updated_at?.toISOString() || "",
    }));
    return c.json({ templates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `テンプレート一覧取得エラー: ${message}` }, 500);
  }
});

app.post("/templates", async (c) => {
  try {
    const formData = await c.req.formData();
    const files = formData.getAll("files") as File[];
    const assignServiceName = formData.get("serviceName") as string | null;

    if (!files || files.length === 0) {
      return c.json({ error: "ファイルが選択されていません" }, 400);
    }

    const pool = getPool();
    const results: { name: string; size: number; serviceName: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u3000-\u9FFF\uF900-\uFAFF]/g, "_");
      const svcName = assignServiceName || "";

      // Extract text content for text-based files
      let contentText = "";
      const ext = safeName.split(".").pop()?.toLowerCase() || "";
      if (["txt", "md", "csv", "json"].includes(ext)) {
        contentText = await file.text();
        contentText = contentText.slice(0, 5000);
      }

      await pool.query(
        `INSERT INTO proposal_templates (name, service_name, file_data, file_size, content_text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           service_name = COALESCE(NULLIF($2, ''), proposal_templates.service_name),
           file_data = $3, file_size = $4, content_text = $5, updated_at = CURRENT_TIMESTAMP`,
        [safeName, svcName, buffer, buffer.length, contentText],
      );
      results.push({ name: safeName, size: buffer.length, serviceName: svcName });
    }

    return c.json({ uploaded: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `アップロードエラー: ${message}` }, 500);
  }
});

app.delete("/templates", async (c) => {
  try {
    const { name } = await c.req.json();
    if (!name) return c.json({ error: "ファイル名が必要です" }, 400);

    const pool = getPool();
    await pool.query("DELETE FROM proposal_templates WHERE name = $1", [name]);
    return c.json({ deleted: name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `削除エラー: ${message}` }, 500);
  }
});

app.patch("/templates", async (c) => {
  try {
    const { name, serviceName } = await c.req.json();
    if (!name) return c.json({ error: "ファイル名が必要です" }, 400);

    const pool = getPool();
    if (serviceName !== undefined) {
      await pool.query(
        "UPDATE proposal_templates SET service_name = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2",
        [serviceName, name],
      );
    }
    return c.json({ updated: { name, serviceName: serviceName || "" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `更新エラー: ${message}` }, 500);
  }
});

app.post("/templates/detect", async (c) => {
  try {
    const { fileNames, model } = await c.req.json();
    if (!process.env.GEMINI_API_KEY) {
      return c.json({ error: "Gemini APIキーが設定されていません" }, 400);
    }

    const pool = getPool();
    const existingRes = await pool.query(
      "SELECT name, service_name, content_text FROM proposal_templates",
    );
    const existingTemplates = existingRes.rows.map((r) => ({
      name: r.name, serviceName: r.service_name || "",
      snippet: (r.content_text || "").slice(0, 500),
    }));

    const results: { fileName: string; serviceName: string; confidence: string; similarTo: string | null; similarityReason: string | null }[] = [];

    for (const fileName of fileNames as string[]) {
      const row = await pool.query("SELECT content_text FROM proposal_templates WHERE name = $1", [fileName]);
      const content = row.rows[0]?.content_text || "";
      const prompt = buildDetectPrompt(fileName, content, existingTemplates.filter((t) => t.name !== fileName));

      try {
        const text = await generateText(prompt, 500, model);
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        results.push({
          fileName, serviceName: parsed.serviceName || "", confidence: parsed.confidence || "low",
          similarTo: parsed.similarTo || null, similarityReason: parsed.similarityReason || null,
        });
      } catch {
        const n = fileName.toLowerCase();
        let guessedName = "";
        if (n.includes("dx") || n.includes("開発") || n.includes("development")) guessedName = "DX開発サービス";
        else if (n.includes("rag") || n.includes("ai_agent") || n.includes("aiagent")) guessedName = "AI RAG Agent";
        else if (n.includes("書きあげ") || n.includes("kakiage") || n.includes("文字起こし")) guessedName = "書きあげクン";
        results.push({ fileName, serviceName: guessedName, confidence: "low", similarTo: null, similarityReason: null });
      }
    }

    return c.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `検出エラー: ${message}` }, 500);
  }
});

export default app;
