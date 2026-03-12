"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Trash2Icon,
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Concurrency control
// ---------------------------------------------------------------------------

/** 限制並行数で非同期タスクを実行（worker pool） */
async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  concurrency: number,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      await tasks[i]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );
}

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

interface KBInfo {
  slug: string;
  name: string;
  title: string;
  description: string;
  doc_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IN_PROGRESS_STATUSES = [
  "uploading",
  "ocr",
  "indexing",
  "extracting",
  "processing",
];

async function fetchDocuments(kb: string): Promise<DocumentInfo[]> {
  const res = await fetch(`/api/documents?kb=${encodeURIComponent(kb)}`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  const data = await res.json();
  return data.documents || [];
}

async function fetchKB(slug: string): Promise<KBInfo> {
  const res = await fetch(`/api/kbs/${slug}`);
  if (!res.ok) throw new Error("ナレッジベースが見つかりません");
  return res.json();
}

function StatusBadge({
  status,
  errorMsg,
}: {
  status?: string;
  errorMsg?: string | null;
}) {
  if (!status || status === "processed") return null;

  const config: Record<string, { label: string; className: string }> = {
    uploading: {
      label: "アップロード中",
      className: "text-blue-500 bg-blue-500/10",
    },
    ocr: { label: "OCR 処理中", className: "text-blue-500 bg-blue-500/10" },
    indexing: {
      label: "インデックス作成中",
      className: "text-yellow-500 bg-yellow-500/10",
    },
    extracting: {
      label: "解析中",
      className: "text-yellow-500 bg-yellow-500/10",
    },
    processing: {
      label: "解析中",
      className: "text-yellow-500 bg-yellow-500/10",
    },
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
// KBDetailPage
// ---------------------------------------------------------------------------

export const KBDetailPage = memo(function KBDetailPage({
  slug,
}: {
  slug: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteKb, setShowDeleteKb] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // KB header name editing
  const [editingHeaderName, setEditingHeaderName] = useState(false);
  const [kbName, setKbName] = useState("");
  const syncedRef = useRef(false);

  // Fetch KB info
  const { data: kb, isError: kbError } = useQuery({
    queryKey: ["kb", slug],
    queryFn: () => fetchKB(slug),
  });

  // Sync KB name into editing state
  if (kb && !syncedRef.current) {
    syncedRef.current = true;
    setKbName(kb.name);
  }

  // Fetch documents
  const { data: documents = [], isPending: loading } = useQuery({
    queryKey: ["documents", slug],
    queryFn: () => fetchDocuments(slug),
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs) return false;
      return docs.some((d) => IN_PROGRESS_STATUSES.includes(d.status ?? ""))
        ? 5000
        : false;
    },
  });

  // Merge with uploading placeholders
  const displayDocs: DocumentInfo[] = [
    ...uploadingNames.map((name, i) => ({
      id: `uploading-${i}`,
      name,
      page_count: 0,
      status: "uploading" as const,
    })),
    ...documents,
  ];

  // Save KB name
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/kbs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: kbName }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", slug] });
      queryClient.invalidateQueries({ queryKey: ["kbs"] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "保存に失敗しました"),
  });

  // Delete KB
  const deleteKbMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/kbs/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kbs"] });
      router.push("/documents");
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "削除に失敗しました"),
  });

  // Upload
  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      if (fileList.length === 0) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);

      const names = fileList.map((f) => f.name.replace(/\.pdf$/i, ""));
      setUploadingNames((prev) => [...names, ...prev]);

      const tasks = fileList.map((file) => async () => {
        const name = file.name.replace(/\.pdf$/i, "");
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch(
            `/api/documents/upload?kb=${encodeURIComponent(slug)}`,
            { method: "POST", body: formData },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Upload failed");
          }
          queryClient.invalidateQueries({ queryKey: ["documents", slug] });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "アップロードに失敗しました",
          );
        } finally {
          setUploadingNames((prev) => prev.filter((n) => n !== name));
        }
      });

      runWithConcurrency(tasks, 2).then(() => {
        fetch(`/api/kbs/${slug}/generate`, { method: "POST" })
          .then(() => {
            syncedRef.current = false;
            queryClient.invalidateQueries({ queryKey: ["kb", slug] });
            queryClient.invalidateQueries({ queryKey: ["kbs"] });
          })
          .catch(() => {});
      });
    },
    [queryClient, slug],
  );

  // Delete single document
  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setDeletingId(doc.id);
      const res = await fetch(
        `/api/documents/${doc.id}?kb=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", slug] });
      fetch(`/api/kbs/${slug}/generate`, { method: "POST" })
        .then(() => {
          syncedRef.current = false;
          queryClient.invalidateQueries({ queryKey: ["kb", slug] });
          queryClient.invalidateQueries({ queryKey: ["kbs"] });
        })
        .catch(() => {});
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "削除に失敗しました"),
    onSettled: () => setDeletingId(null),
  });

  // Delete all documents
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents?kb=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete all failed");
      await fetch(`/api/kbs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", description: "" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", slug] });
      queryClient.invalidateQueries({ queryKey: ["kb", slug] });
      queryClient.invalidateQueries({ queryKey: ["kbs"] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "全削除に失敗しました"),
  });

  const confirmDelete = useCallback(
    (doc: DocumentInfo) => {
      setDeleteTarget(null);
      setError(null);
      deleteMutation.mutate(doc);
    },
    [deleteMutation],
  );

  if (kbError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          ナレッジベースが見つかりません
        </p>
        <Button variant="outline" onClick={() => router.push("/documents")}>
          <ArrowLeftIcon className="size-4 mr-1.5" />
          一覧に戻る
        </Button>
      </div>
    );
  }

  const processedCount = displayDocs.filter(
    (d) => d.status === "processed" || !d.status,
  ).length;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/documents")}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-label="一覧に戻る"
            >
              <ArrowLeftIcon className="size-4" />
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {editingHeaderName ? (
                <form
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditingHeaderName(false);
                    saveMutation.mutate();
                  }}
                >
                  <Input
                    autoFocus
                    value={kbName}
                    onChange={(e) => setKbName(e.target.value)}
                    className="h-8 text-base font-semibold flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setKbName(kb?.name ?? "");
                        setEditingHeaderName(false);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <CheckIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    onClick={() => {
                      setKbName(kb?.name ?? "");
                      setEditingHeaderName(false);
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </form>
              ) : (
                <>
                  <h2 className="text-lg font-semibold tracking-tight truncate">
                    {kb?.name ?? slug}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditingHeaderName(true)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    aria-label="名前を編集"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {displayDocs.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteAll(true)}
                  disabled={deleteAllMutation.isPending}
                >
                  {deleteAllMutation.isPending ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-3.5" />
                  )}
                  全削除
                </Button>
              )}
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
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteKb(true)}
                disabled={deleteKbMutation.isPending}
              >
                {deleteKbMutation.isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <TrashIcon className="size-3.5" />
                )}
                KB 削除
              </Button>
            </div>
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
          ) : displayDocs.length === 0 ? (
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
            <>
              <div className="mb-3 text-xs text-muted-foreground">
                {processedCount} / {displayDocs.length} 処理済み
              </div>
              <div className="space-y-2">
                {displayDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="group flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                      {doc.id.startsWith("uploading-") ? (
                        <Loader2Icon className="size-4 animate-spin text-primary/70" />
                      ) : (
                        <FileTextIcon className="size-4 text-primary/70" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {doc.page_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {doc.page_count} ページ
                          </span>
                        )}
                        <StatusBadge
                          status={doc.status}
                          errorMsg={doc.error_msg}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(doc)}
                      disabled={
                        deletingId === doc.id ||
                        (doc.status !== "processed" &&
                          doc.status !== "failed" &&
                          doc.status !== undefined)
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
            </>
          )}
        </div>
      </ScrollArea>

      {/* Delete document confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
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

      {/* Delete all documents confirmation */}
      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>全ドキュメントを削除</AlertDialogTitle>
            <AlertDialogDescription>
              {displayDocs.length}{" "}
              件のドキュメントを全て削除しますか？ナレッジグラフとベクトルデータも完全に削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowDeleteAll(false);
                setError(null);
                deleteAllMutation.mutate();
              }}
            >
              全て削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete KB confirmation */}
      <AlertDialog open={showDeleteKb} onOpenChange={setShowDeleteKb}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ナレッジベースを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{kb?.name}
              」を削除しますか？全てのドキュメント、ナレッジグラフ、ベクトルデータが完全に削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowDeleteKb(false);
                setError(null);
                deleteKbMutation.mutate();
              }}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
