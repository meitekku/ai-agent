import { CRM_SERVICE_URL } from "@/lib/constants";
import { getSession } from "@/lib/proposal-session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!CRM_SERVICE_URL) {
    return Response.json({ error: "CRM service not configured" }, { status: 503 });
  }

  try {
    const { sessionKey } = await req.json();
    if (!sessionKey) {
      return Response.json({ error: "sessionKey is required" }, { status: 400 });
    }

    const session = getSession(sessionKey);
    if (!session) {
      return Response.json({ error: "Session not found or expired" }, { status: 404 });
    }

    const res = await fetch(`${CRM_SERVICE_URL}/proposal/generate-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: session.data,
        analysis: session.analysis,
        additionalContext: session.additionalContext || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      return Response.json(err, { status: res.status });
    }

    return Response.json(await res.json());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return Response.json({ error: `Plan生成エラー: ${message}` }, { status: 500 });
  }
}
