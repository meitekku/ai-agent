import { getOrphanFiles, deleteChatFiles } from "@/lib/chat-files-db";
import { deleteStoredFile } from "@/lib/file-storage";

/**
 * Clean up orphan files — uploaded but never referenced in any message.
 * Default: files older than 60 minutes.
 * Returns count of deleted files.
 */
export async function cleanupOrphanFiles(
  maxAgeMinutes = 60,
): Promise<number> {
  const orphans = await getOrphanFiles(maxAgeMinutes);
  if (orphans.length === 0) return 0;

  const ids = orphans.map((f) => f.id);
  const paths = await deleteChatFiles(ids);

  await Promise.allSettled(paths.map((p) => deleteStoredFile(p)));

  console.log(
    `[file-cleanup] deleted ${paths.length} orphan file(s)`,
  );
  return paths.length;
}
