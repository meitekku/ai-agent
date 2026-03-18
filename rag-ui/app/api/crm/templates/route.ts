import { CRM_SERVICE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** GET /api/crm/templates → list all proposal templates */
export async function GET() {
  if (!CRM_SERVICE_URL) {
    return Response.json({ templates: [] });
  }

  try {
    const res = await fetch(`${CRM_SERVICE_URL}/templates`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      // Graceful degradation: return empty list on error
      console.error(`[crm/templates] list failed: ${res.status}`);
      return Response.json({ templates: [] });
    }
    return Response.json(await res.json());
  } catch (err) {
    console.error("[crm/templates] list error:", err);
    return Response.json({ templates: [] });
  }
}

/** POST /api/crm/templates → upload template files (FormData passthrough) */
export async function POST(req: Request) {
  if (!CRM_SERVICE_URL) {
    return Response.json({ error: "CRM service not configured" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const res = await fetch(`${CRM_SERVICE_URL}/templates`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      return Response.json(err, { status: res.status });
    }
    return Response.json(await res.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return Response.json({ error: message }, { status: 500 });
  }
}
