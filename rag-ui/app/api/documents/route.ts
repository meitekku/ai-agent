import { listDocuments, deleteAllDocuments } from "@/lib/rag-client";
import { getKbFilesByDocIds } from "@/lib/kb-files-db";
import { deleteKbFilesByKb } from "@/lib/kb-files-db";
import { deleteKbStoredFile } from "@/lib/file-storage";

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
    const docs = result.documents || [];

    // Enrich with file_id for download buttons
    if (docs.length > 0) {
      const docIds = docs.map((d) => d.id);
      const fileMap = await getKbFilesByDocIds(docIds);
      const enriched = docs.map((doc) => ({
        ...doc,
        file_id: fileMap[doc.id]?.id ?? null,
      }));
      return Response.json({ documents: enriched });
    }

    return Response.json({ documents: docs });
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

    // Delete stored KB files from disk + DB
    const storedPaths = await deleteKbFilesByKb(kb);
    await Promise.all(
      storedPaths.map((p) => deleteKbStoredFile(p).catch(() => {})),
    );

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
