import { listDocuments, deleteAllDocuments } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listDocuments();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list documents" },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  try {
    const result = await deleteAllDocuments();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete all documents" },
      { status: 502 },
    );
  }
}
