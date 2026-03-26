import { getSession } from "@/lib/proposal-session";

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
  });
}
