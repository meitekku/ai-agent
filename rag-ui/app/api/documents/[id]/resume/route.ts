import { LIGHTRAG_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const kb = searchParams.get("kb");
    if (!kb) {
      return Response.json(
        { error: "kb parameter is required" },
        { status: 400 },
      );
    }

    const res = await fetch(
      `${LIGHTRAG_URL}/documents/${id}/resume?kb=${encodeURIComponent(kb)}`,
      { method: "POST" },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(
        { error: data.detail || "続行に失敗しました" },
        { status: res.status },
      );
    }

    return Response.json(await res.json());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "続行に失敗しました" },
      { status: 502 },
    );
  }
}
