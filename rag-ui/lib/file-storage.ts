import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join, extname } from "path";
import { nanoid } from "nanoid";

const CHAT_FILES_DIR =
  process.env.CHAT_FILES_DIR || join(process.cwd(), "data", "chat-files");

/**
 * Get a year-month subdirectory path (e.g. "2026-03")
 */
function monthDir(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Save a file to disk. Returns { id, storedPath } where storedPath is relative
 * to CHAT_FILES_DIR (e.g. "2026-03/abc123.pdf").
 */
export async function saveFile(
  buffer: Buffer,
  originalName: string,
): Promise<{ id: string; storedPath: string }> {
  const id = nanoid();
  const ext = extname(originalName) || "";
  const sub = monthDir();
  const dir = join(CHAT_FILES_DIR, sub);
  await mkdir(dir, { recursive: true });
  const filename = `${id}${ext}`;
  const storedPath = `${sub}/${filename}`;
  await writeFile(join(dir, filename), buffer);
  return { id, storedPath };
}

/**
 * Read a file from disk given its stored path (relative to CHAT_FILES_DIR).
 */
export async function readStoredFile(storedPath: string): Promise<Buffer> {
  return readFile(join(CHAT_FILES_DIR, storedPath));
}

/**
 * Delete a file from disk. Silently ignores if file doesn't exist.
 */
export async function deleteStoredFile(storedPath: string): Promise<void> {
  try {
    await unlink(join(CHAT_FILES_DIR, storedPath));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
