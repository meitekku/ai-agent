import { deleteDocument, ingestDocument } from "@/lib/rag-client";
import { getKbFileByDocId, updateKbFileDocId } from "@/lib/kb-files-db";
import { readKbStoredFile } from "@/lib/file-storage";

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

    // 1. Get stored file info
    const kbFile = await getKbFileByDocId(id);
    if (!kbFile) {
      return Response.json(
        { error: "元ファイルが見つかりません。再アップロードしてください。" },
        { status: 404 },
      );
    }

    // 2. Read original file from disk
    let buffer: Buffer;
    try {
      buffer = await readKbStoredFile(kbFile.stored_path);
    } catch {
      return Response.json(
        { error: "元ファイルの読み取りに失敗しました。再アップロードしてください。" },
        { status: 404 },
      );
    }

    // 3. Delete old document from lightrag (cleanup partial KG/vector data)
    try {
      await deleteDocument(id, kb);
    } catch {
      // May fail if job was already partially cleaned — continue anyway
    }

    // 4. Re-upload to lightrag
    const blob = new Blob([new Uint8Array(buffer)]);
    const formData = new FormData();
    formData.append("file", blob, kbFile.original_name);
    const result = await ingestDocument(formData, kb);

    // 5. Update kb_files reference to new doc_id
    await updateKbFileDocId(id, result.doc_id);

    return Response.json({ ...result, file_id: kbFile.id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "リトライに失敗しました" },
      { status: 502 },
    );
  }
}
