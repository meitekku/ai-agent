import { listDocuments, deleteAllDocuments } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kb = searchParams.get("kb");
    if (!kb) {
      return Response.json(
        { error: "kb parameter is required" },
        { status: 400 },
      );
    }
    const result = await listDocuments(kb);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to list documents",
      },
      { status: 502 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kb = searchParams.get("kb");
    if (!kb) {
      return Response.json(
        { error: "kb parameter is required" },
        { status: 400 },
      );
    }
    const result = await deleteAllDocuments(kb);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete all documents",
      },
      { status: 502 },
    );
  }
}
