import { cleanupOrphanFiles } from "@/lib/file-cleanup";

export async function onRequestInit() {
  // no-op: only need register hook
}

export async function register() {
  // Clean up orphan files on startup, then every 6 hours
  cleanupOrphanFiles().catch((err) =>
    console.error("[startup] Orphan file cleanup failed:", err),
  );
  setInterval(
    () =>
      cleanupOrphanFiles().catch((err) =>
        console.error("[scheduled] Orphan file cleanup failed:", err),
      ),
    6 * 60 * 60 * 1000,
  );
}
