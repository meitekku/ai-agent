import { NextResponse } from "next/server";
import { getKbFile } from "@/lib/kb-files-db";
import { readKbStoredFile } from "@/lib/file-storage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const download = url.searchParams.get("dl") === "1";

  try {
    const row = await getKbFile(id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await readKbStoredFile(row.stored_path);
    const disposition = download ? "attachment" : "inline";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.media_type,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(row.original_name)}"`,
      },
    });
  } catch (err) {
    console.error("[kb-files/serve] error:", err);
    return NextResponse.json({ error: "File read failed" }, { status: 500 });
  }
}
