import { deleteDocument } from "@/lib/rag-client";
import { getKbFileByDocId, deleteKbFile } from "@/lib/kb-files-db";
import { deleteKbStoredFile } from "@/lib/file-storage";

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

    // Clean up stored KB file (if exists)
    const kbFile = await getKbFileByDocId(id);
    if (kbFile) {
      const storedPath = await deleteKbFile(kbFile.id);
      if (storedPath) {
        await deleteKbStoredFile(storedPath).catch(() => {});
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 502 },
    );
  }
}
