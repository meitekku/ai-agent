import { ingestDocument } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    // -- Validate input -----------------------------------------------------

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "File too large (max 50 MB)" }, { status: 413 });
    }

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return Response.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    // -- Forward to backend -------------------------------------------------

    const upload = new FormData();
    upload.append("file", file);
    try {
      const result = await ingestDocument(upload);
      return Response.json(result);
    } catch (err) {
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
