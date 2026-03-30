import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/file-storage";
import { insertChatFile } from "@/lib/chat-files-db";
import { insertExecutionFile } from "@/lib/scheduler-db";

/**
 * POST /api/task-files
 * Called by task-worker to save file artifacts.
 * Accepts multipart/form-data: file + filename + mediaType + executionId
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const filename = (form.get("filename") as string) || file?.name || "untitled";
    const mediaType = (form.get("mediaType") as string) || file?.type || "application/octet-stream";
    const executionId = parseInt(form.get("executionId") as string, 10);

    if (!file || !executionId) {
      return NextResponse.json(
        { error: "file and executionId are required" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save to disk
    const { id: fileId, storedPath } = await saveFile(buffer, filename);

    // Register in chat_files (reuse existing table for disk tracking)
    await insertChatFile({
      id: fileId,
      originalName: filename,
      storedPath,
      mediaType,
      sizeBytes: buffer.length,
    });

    // Link to execution
    await insertExecutionFile({
      executionId,
      fileId,
      filename,
      mediaType,
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
