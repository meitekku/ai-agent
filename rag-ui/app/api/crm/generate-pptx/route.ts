import { CRM_SERVICE_URL } from "@/lib/constants";

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
    const res = await fetch(`${CRM_SERVICE_URL}/proposal/generate-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
