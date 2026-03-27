import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/file-storage";
import { insertChatFile } from "@/lib/chat-files-db";
import { insertExecutionFile } from "@/lib/scheduler-db";

/**
 * POST /api/task-files
 * Called by task-worker to save file artifacts.
 * Body: { content: string (base64), filename: string, mediaType: string, executionId: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, filename, mediaType, executionId } = body;

    if (!content || !filename || !executionId) {
      return NextResponse.json(
        { error: "content, filename, and executionId are required" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(content, "base64");
    const mimeType = mediaType || "application/octet-stream";

    // Save to disk
    const { id: fileId, storedPath } = await saveFile(buffer, filename);

    // Register in chat_files (reuse existing table for disk tracking)
    await insertChatFile({
      id: fileId,
      originalName: filename,
      storedPath,
      mediaType: mimeType,
      sizeBytes: buffer.length,
    });

    // Link to execution
    await insertExecutionFile({
      executionId,
      fileId,
      filename,
      mediaType: mimeType,
      sizeBytes: buffer.length,
    });

    return NextResponse.json({
      fileId,
      url: `/api/task-files/${fileId}`,
      filename,
      size: buffer.length,
    });
  } catch (e) {
    console.error("POST /api/task-files error:", e);
    return NextResponse.json(
      { error: "Failed to save file" },
      { status: 500 },
    );
  }
}
