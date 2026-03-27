import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth-token";
import { getExecutionFile } from "@/lib/scheduler-db";
import { getChatFile } from "@/lib/chat-files-db";
import { readStoredFile } from "@/lib/file-storage";

const PW = process.env.PW;

/**
 * GET /api/task-files/[fileId]
 * Authenticated file download for task execution artifacts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  // Auth check
  if (PW) {
    const cookie = req.cookies.get("pw")?.value;
    if (!cookie || !verifyToken(cookie, PW)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { fileId } = await params;

    // Verify file belongs to a task execution
    const execFile = await getExecutionFile(fileId);
    if (!execFile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get file metadata from chat_files
    const fileMeta = await getChatFile(fileId);
    if (!fileMeta) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read from disk and stream to browser
    const buffer = await readStoredFile(fileMeta.stored_path);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": fileMeta.media_type,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(execFile.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/task-files/[fileId] error:", e);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
