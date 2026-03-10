import { getKB, updateKB, deleteKB } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const kb = await getKB(slug);
    return Response.json(kb);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to get KB" },
      { status: 502 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const result = await updateKB(slug, body);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update KB" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await deleteKB(slug);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete KB" },
      { status: 502 },
    );
  }
}
