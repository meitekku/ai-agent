import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join, extname } from "path";
import { nanoid } from "nanoid";

function getChatFilesDir(): string {
  return process.env.CHAT_FILES_DIR || join(process.cwd(), "data", "chat-files");
}

function getKbFilesDir(): string {
  return process.env.KB_FILES_DIR || join(process.cwd(), "data", "kb-files");
}

/**
 * Get a year-month subdirectory path (e.g. "2026-03")
 */
function monthDir(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _saveFile(
  buffer: Buffer,
  originalName: string,
  baseDir: string,
): Promise<{ id: string; storedPath: string }> {
  const id = nanoid();
  const ext = extname(originalName) || "";
  const sub = monthDir();
  const dir = join(baseDir, sub);
  await mkdir(dir, { recursive: true });
  const filename = `${id}${ext}`;
  const storedPath = `${sub}/${filename}`;
  await writeFile(join(dir, filename), buffer);
  return { id, storedPath };
}

function _readFile(storedPath: string, baseDir: string): Promise<Buffer> {
  return readFile(join(baseDir, storedPath));
}

async function _deleteFile(storedPath: string, baseDir: string): Promise<void> {
  try {
    await unlink(join(baseDir, storedPath));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ---------------------------------------------------------------------------
// Chat files (existing)
// ---------------------------------------------------------------------------

export async function saveFile(
  buffer: Buffer,
  originalName: string,
): Promise<{ id: string; storedPath: string }> {
  return _saveFile(buffer, originalName, getChatFilesDir());
}

export async function readStoredFile(storedPath: string): Promise<Buffer> {
  return _readFile(storedPath, getChatFilesDir());
}

export async function deleteStoredFile(storedPath: string): Promise<void> {
  return _deleteFile(storedPath, getChatFilesDir());
}

// ---------------------------------------------------------------------------
// KB files
// ---------------------------------------------------------------------------

export async function saveKbFile(
  buffer: Buffer,
  originalName: string,
): Promise<{ id: string; storedPath: string }> {
  return _saveFile(buffer, originalName, getKbFilesDir());
}

export async function readKbStoredFile(storedPath: string): Promise<Buffer> {
  return _readFile(storedPath, getKbFilesDir());
}

export async function deleteKbStoredFile(storedPath: string): Promise<void> {
  return _deleteFile(storedPath, getKbFilesDir());
}
