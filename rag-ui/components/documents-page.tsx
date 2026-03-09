"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileTextIcon,
  TrashIcon,
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentInfo {
  id: string;
  name: string;
  page_count: number;
  status?: string;
  error_msg?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IN_PROGRESS_STATUSES = ["uploading", "ocr", "indexing", "extracting", "processing"];

async function fetchDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch("/api/documents");
  if (!res.ok) throw new Error("Failed to fetch documents");
  const data = await res.json();
  return data.documents || [];
}

function StatusBadge({ status, errorMsg }: { status?: string; errorMsg?: string | null }) {
  if (!status || status === "processed") return null;

  const config: Record<string, { label: string; className: string }> = {
    uploading: { label: "アップロード中", className: "text-blue-500 bg-blue-500/10" },
    ocr: { label: "OCR 処理中", className: "text-blue-500 bg-blue-500/10" },
    indexing: { label: "インデックス作成中", className: "text-yellow-500 bg-yellow-500/10" },
    extracting: { label: "実体抽出中", className: "text-yellow-500 bg-yellow-500/10" },
    processing: { label: "実体抽出中", className: "text-yellow-500 bg-yellow-500/10" },
    failed: { label: "失敗", className: "text-destructive bg-destructive/10" },
  };

  const c = config[status];
  if (!c) return null;

  const isSpinning = IN_PROGRESS_STATUSES.includes(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}
      title={status === "failed" ? errorMsg || undefined : undefined}
    >
      {isSpinning && <Loader2Icon className="size-3 animate-spin" />}
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DocumentsPage
// ---------------------------------------------------------------------------

export const DocumentsPage = memo(function DocumentsPage() {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: documents = [], isPending: loading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs) return false;
      return docs.some((d) => IN_PROGRESS_STATUSES.includes(d.status ?? "")) ? 5000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "アップロードに失敗しました"),
  });

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      if (fileList.length === 0) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
      for (const file of fileList) uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setDeletingId(doc.id);
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "削除に失敗しました"),
    onSettled: () => setDeletingId(null),
  });

  const confirmDelete = useCallback(
    (doc: DocumentInfo) => {
      setDeleteTarget(null);
      setError(null);
      deleteMutation.mutate(doc);
    },
    [deleteMutation],
  );

  const processedCount = documents.filter((d) => d.status === "processed" || !d.status).length;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">ドキュメント</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              ナレッジベースの PDF を管理
              {documents.length > 0 && (
                <span className="ml-2 text-xs">
                  ({processedCount} / {documents.length} 処理済み)
                </span>
              )}
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon className="size-4" />
              アップロード
            </Button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-3xl w-full px-6 pt-4">
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" />
            <span>{error}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-destructive"
              onClick={() => setError(null)}
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {/* Document list */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <FileTextIcon className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">ドキュメントがありません</p>
                <p className="text-sm text-muted-foreground">
                  PDF をアップロードしてナレッジベースを構築しましょう
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                    <FileTextIcon className="size-4 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {doc.page_count > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {doc.page_count} ページ
                        </span>
                      )}
                      <StatusBadge status={doc.status} errorMsg={doc.error_msg} />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(doc)}
                    disabled={
                      deletingId === doc.id ||
                      (doc.status !== "processed" && doc.status !== "failed" && doc.status !== undefined)
                    }
                    aria-label={`${doc.name} を削除`}
                  >
                    {deletingId === doc.id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <TrashIcon className="size-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ドキュメントを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name}」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && confirmDelete(deleteTarget)}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
