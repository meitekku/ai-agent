import { ingestDocument } from "@/lib/rag-client";
import { saveKbFile, deleteKbStoredFile } from "@/lib/file-storage";
import { insertKbFile } from "@/lib/kb-files-db";
import { extname } from "path";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const SUPPORTED = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

function mimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".html": "text/html",
    ".htm": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kb = searchParams.get("kb");
    if (!kb) {
      return Response.json(
        { error: "kb parameter is required" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    // -- Validate input -----------------------------------------------------

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File too large (max 50 MB)" },
        { status: 413 },
      );
    }

    const ext = extname(file.name).toLowerCase();
    if (!SUPPORTED.has(ext)) {
      return Response.json(
        {
          error: `サポートされていないファイル形式です: ${ext}`,
        },
        { status: 400 },
      );
    }

    // -- Save original file to disk -----------------------------------------

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveKbFile(buffer, file.name);

    // -- Forward to backend -------------------------------------------------

    try {
      const upload = new FormData();
      upload.append("file", file);
      const result = await ingestDocument(upload, kb);

      // Record file in DB
      await insertKbFile({
        id: saved.id,
        docId: result.doc_id,
        kbSlug: kb,
        originalName: file.name,
        storedPath: saved.storedPath,
        mediaType: mimeType(file.name),
        sizeBytes: buffer.length,
      });

      return Response.json({ ...result, file_id: saved.id });
    } catch (err) {
      // Cleanup saved file on backend failure
      await deleteKbStoredFile(saved.storedPath).catch(() => {});

      // Forward 409 Conflict (duplicate file) as-is
      if (err instanceof Error && err.message.includes("既に存在")) {
        return Response.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 502 },
    );
  }
}
