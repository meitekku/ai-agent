import { getSession, updateSessionUI } from "@/lib/proposal-session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const session = await getSession(key);
  if (!session) {
    return Response.json({ error: "Session not found or expired" }, { status: 404 });
  }
  return Response.json({
    data: session.data,
    analysis: session.analysis,
    additionalContext: session.additionalContext,
    phase: session.phase,
    styleOptions: session.styleOptions,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const body = await req.json();
  const phase = typeof body.phase === "string" ? body.phase : "analysis";
  const styleOptions =
    body.styleOptions && typeof body.styleOptions === "object"
      ? body.styleOptions
      : {};
  updateSessionUI(key, phase, styleOptions);
  return Response.json({ ok: true });
}
