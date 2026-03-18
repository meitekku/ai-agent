"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";

export interface UploadedFile extends FileUIPart {
  id: string;
  /** Upload progress 0-100, or -1 for error */
  progress: number;
  /** Human-readable file size */
  sizeLabel: string;
  /** Error message if upload failed */
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Hook that watches a list of FileUIPart attachments (from PromptInput)
 * and uploads any with blob: URLs to /api/files/upload, replacing the URL
 * on completion.
 *
 * Returns upload state per file and a helper to check if all uploads are done.
 */
export function useFileUpload(
  files: (FileUIPart & { id: string })[],
  updateFileUrl: (id: string, newUrl: string) => void,
) {
  const [uploadState, setUploadState] = useState<Record<string, UploadedFile>>(
    {},
  );
  // Track which blob URLs we've already started uploading
  const uploadingRef = useRef<Set<string>>(new Set());

  const uploadFile = useCallback(
    async (file: FileUIPart & { id: string }) => {
      if (!file.url?.startsWith("blob:")) return;
      if (uploadingRef.current.has(file.id)) return;
      uploadingRef.current.add(file.id);

      // Fetch the blob
      let blob: Blob;
      try {
        const res = await fetch(file.url);
        blob = await res.blob();
      } catch {
        setUploadState((prev) => ({
          ...prev,
          [file.id]: {
            ...file,
            progress: -1,
            sizeLabel: "0 B",
            error: "Failed to read file",
          },
        }));
        return;
      }

      const sizeLabel = formatSize(blob.size);

      // Set initial progress
      setUploadState((prev) => ({
        ...prev,
        [file.id]: { ...file, progress: 0, sizeLabel },
      }));

      const formData = new FormData();
      formData.append("file", blob, file.filename ?? "file");

      try {
        // Use XMLHttpRequest for progress tracking
        const result = await new Promise<{
          id: string;
          url: string;
          filename: string;
          mediaType: string;
          size: number;
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/files/upload");

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setUploadState((prev) => ({
                ...prev,
                [file.id]: { ...prev[file.id], progress: pct },
              }));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(formData);
        });

        // Upload succeeded — update the attachment URL
        updateFileUrl(file.id, result.url);

        setUploadState((prev) => ({
          ...prev,
          [file.id]: {
            ...prev[file.id],
            url: result.url,
            progress: 100,
            sizeLabel,
          },
        }));
      } catch (err) {
        setUploadState((prev) => ({
          ...prev,
          [file.id]: {
            ...prev[file.id],
            progress: -1,
            error: err instanceof Error ? err.message : "Upload failed",
          },
        }));
      }
    },
    [updateFileUrl],
  );

  // Watch for new blob files and auto-upload
  useEffect(() => {
    for (const file of files) {
      if (file.url?.startsWith("blob:") && !uploadingRef.current.has(file.id)) {
        uploadFile(file);
      }
    }
  }, [files, uploadFile]);

  // Clean up state for removed files
  useEffect(() => {
    const currentIds = new Set(files.map((f) => f.id));
    setUploadState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          uploadingRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  const retryUpload = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      uploadingRef.current.delete(fileId);
      setUploadState((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      uploadFile(file);
    },
    [files, uploadFile],
  );

  const allUploaded =
    files.length === 0 ||
    files.every((f) => {
      if (!f.url?.startsWith("blob:")) return true;
      const state = uploadState[f.id];
      return state?.progress === 100;
    });

  return { uploadState, allUploaded, retryUpload };
}
