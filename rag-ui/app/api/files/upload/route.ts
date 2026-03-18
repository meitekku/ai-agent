import { NextResponse } from "next/server";
import { saveFile } from "@/lib/file-storage";
import { insertChatFile } from "@/lib/chat-files-db";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { id, storedPath } = await saveFile(buffer, file.name);

    await insertChatFile({
      id,
      originalName: file.name,
      storedPath,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    return NextResponse.json({
      id,
      url: `/api/files/${id}`,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (err) {
    console.error("[files/upload] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
