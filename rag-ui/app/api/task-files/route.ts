import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/file-storage";
import { insertChatFile } from "@/lib/chat-files-db";
import { insertExecutionFile, listExecutionFiles, listExecutionFilesForTask } from "@/lib/scheduler-db";

/**
 * GET /api/task-files?executionId=N   — list files for a specific execution
 * GET /api/task-files?recent=N        — list recent files across all executions (max N)
 */
export async function GET(req: NextRequest) {
  try {
    const executionId = req.nextUrl.searchParams.get("executionId");
    const recent = req.nextUrl.searchParams.get("recent");

    if (executionId) {
      const files = await listExecutionFiles(parseInt(executionId, 10));
      return NextResponse.json({ files });
    }

    if (recent) {
      // List recent files across all executions
      // Use a dummy large taskId=0 won't work, so import the db pool directly
      const { ensureSchedulerTables, getSchedulerPool } = await import("@/lib/scheduler-db");
      await ensureSchedulerTables();
      const limit = Math.min(parseInt(recent, 10) || 50, 100);
      const res = await getSchedulerPool().query(
        `SELECT * FROM task_execution_files ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return NextResponse.json({ files: res.rows });
    }

    return NextResponse.json({ error: "executionId or recent parameter required" }, { status: 400 });
  } catch (e) {
    console.error("GET /api/task-files error:", e);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

/**
 * POST /api/task-files
 * Called by task-worker to save file artifacts.
 * Accepts two modes:
 *   - Streaming: raw binary body + x-filename / x-media-type / x-execution-id headers
 *   - Legacy: multipart/form-data with file + filename + mediaType + executionId fields
 */
export async function POST(req: NextRequest) {
  try {
    let filename: string;
    let mediaType: string;
    let executionId: number;
    let buffer: Buffer;

    const contentType = req.headers.get("content-type") || "";

    if (!contentType.startsWith("multipart/form-data")) {
      // Streaming mode: body is raw binary, metadata in headers
      filename = decodeURIComponent(req.headers.get("x-filename") || "untitled");
      mediaType = req.headers.get("x-media-type") || "application/octet-stream";
      executionId = parseInt(req.headers.get("x-execution-id") || "0", 10);
      if (!executionId) {
        return NextResponse.json({ error: "x-execution-id header is required" }, { status: 400 });
      }
      buffer = Buffer.from(await req.arrayBuffer());
    } else {
      // Legacy multipart mode
      const form = await req.formData();
      const file = form.get("file") as File | null;
      filename = (form.get("filename") as string) || file?.name || "untitled";
      mediaType = (form.get("mediaType") as string) || file?.type || "application/octet-stream";
      executionId = parseInt(form.get("executionId") as string, 10);
      if (!file || !executionId) {
        return NextResponse.json(
          { error: "file and executionId are required" },
          { status: 400 },
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
    }

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
