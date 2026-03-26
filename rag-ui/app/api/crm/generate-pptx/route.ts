import { CRM_SERVICE_URL } from "@/lib/constants";
import { getSession } from "@/lib/proposal-session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!CRM_SERVICE_URL) {
    return Response.json(
      { error: "CRM service not configured" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();

    // Support sessionKey-based lookup
    let payload = body;
    if (body.sessionKey && !body.data) {
      const session = await getSession(body.sessionKey);
      if (!session) {
        return Response.json(
          { error: "Session not found or expired" },
          { status: 404 },
        );
      }
      payload = {
        data: session.data,
        analysis: session.analysis,
        additionalContext: session.additionalContext || undefined,
      };
    }

    const res = await fetch(`${CRM_SERVICE_URL}/proposal/generate-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      return Response.json(err, { status: res.status });
    }

    // Proxy binary response
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") ||
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition":
          res.headers.get("Content-Disposition") ||
          'attachment; filename="proposal.pptx"',
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return Response.json(
      { error: `PPTX生成エラー: ${message}` },
      { status: 500 },
    );
  }
}
