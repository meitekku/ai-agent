import { deleteDocument } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

export async function DELETE(
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
    await deleteDocument(id, kb);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 502 },
    );
  }
}
