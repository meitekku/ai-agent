import { NextResponse } from "next/server";
import { getChatFile } from "@/lib/chat-files-db";
import { readStoredFile } from "@/lib/file-storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const row = await getChatFile(id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await readStoredFile(row.stored_path);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.media_type,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.original_name)}"`,
      },
    });
  } catch (err) {
    console.error("[files/serve] error:", err);
    return NextResponse.json({ error: "File read failed" }, { status: 500 });
  }
}
