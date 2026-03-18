import { CRM_SERVICE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!CRM_SERVICE_URL) {
    return Response.json({ error: "CRM service not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${CRM_SERVICE_URL}/proposal/revise-slide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      return Response.json(err, { status: res.status });
    }

    return Response.json(await res.json());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return Response.json({ error: `Revise エラー: ${message}` }, { status: 500 });
  }
}
