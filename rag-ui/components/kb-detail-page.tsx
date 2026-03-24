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
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  NetworkIcon,
  DownloadIcon,
  RotateCcwIcon,
  PlayIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  file_id?: string | null;
  total_chunks?: number;
  processed_chunks?: number;
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

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

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
  totalChunks,
  processedChunks,
}: {
  status?: string;
  errorMsg?: string | null;
  totalChunks?: number;
  processedChunks?: number;
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
  const chunkLabel =
    status === "extracting" && totalChunks && totalChunks > 0
      ? ` ${processedChunks ?? 0}/${totalChunks}`
      : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}
      title={status === "failed" ? errorMsg || undefined : undefined}
    >
      {isSpinning && <Loader2Icon className="size-3 animate-spin" />}
      {c.label}
      {chunkLabel}
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
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const [showDeleteKb, setShowDeleteKb] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // KB header name/description editing
  const [editingHeaderName, setEditingHeaderName] = useState(false);
  const [kbName, setKbName] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [kbDescription, setKbDescription] = useState("");
  const syncedRef = useRef(false);

  // Fetch KB info
  const { data: kb, isError: kbError } = useQuery({
    queryKey: ["kb", slug],
    queryFn: () => fetchKB(slug),
  });

  // Sync KB name/description into editing state
  if (kb && !syncedRef.current) {
    syncedRef.current = true;
    setKbName(kb.name);
    setKbDescription(kb.description ?? "");
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

  // Merge with uploading placeholders (dedup: skip if backend already has it)
  const backendNames = new Set(documents.map((d) => d.name));
  const displayDocs: DocumentInfo[] = [
    ...uploadingNames
      .filter((name) => !backendNames.has(name))
      .map((name, i) => ({
        id: `uploading-${i}`,
        name,
        page_count: 0,
        status: "uploading" as const,
      })),
    ...documents,
  ];

  // Save KB fields
  const saveMutation = useMutation({
    mutationFn: async (fields: { name?: string; description?: string }) => {
      const res = await fetch(`/api/kbs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
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

  // Delete KB (deletes all documents first, then the KB itself)
  const deleteKbMutation = useMutation({
    mutationFn: async () => {
      // 1. Delete all documents (LightRAG knowledge graph + vectors)
      await fetch(`/api/documents?kb=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      // 2. Delete the KB record
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

  // Drag & drop state
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Shared upload logic
  const processFiles = useCallback(
    (fileList: File[]) => {
      const supported = fileList.filter((f) => {
        const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
        return SUPPORTED_EXTENSIONS.has(ext);
      });
      if (supported.length === 0) {
        setError("サポートされていないファイル形式です");
        return;
      }
      setError(null);

      const names = supported.map((f) => f.name.replace(/\.[^.]+$/, ""));
      setUploadingNames((prev) => [...names, ...prev]);

      const tasks = supported.map((file) => async () => {
        const name = file.name.replace(/\.[^.]+$/, "");
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
          setUploadingNames((prev) => prev.filter((n) => n !== name));
        }
      });

      runWithConcurrency(tasks, tasks.length).then(() => {
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragging(false);
      const fileList = Array.from(e.dataTransfer.files);
      processFiles(fileList);
    },
    [processFiles],
  );

  // Upload (click)
  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      if (fileList.length === 0) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      processFiles(fileList);
    },
    [processFiles],
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

  const confirmDelete = useCallback(
    (doc: DocumentInfo) => {
      setDeleteTarget(null);
      setError(null);
      deleteMutation.mutate(doc);
    },
    [deleteMutation],
  );

  // Retry failed document
  const retryMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setRetryingId(doc.id);
      const res = await fetch(
        `/api/documents/${doc.id}/retry?kb=${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "リトライに失敗しました");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", slug] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "リトライに失敗しました"),
    onSettled: () => setRetryingId(null),
  });

  // Resume failed document (skip OCR, re-trigger pipeline)
  const [resumingId, setResumingId] = useState<string | null>(null);
  const resumeMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setResumingId(doc.id);
      const res = await fetch(
        `/api/documents/${doc.id}/resume?kb=${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "続行に失敗しました");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", slug] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "続行に失敗しました"),
    onSettled: () => setResumingId(null),
  });

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
    <div
      className="flex flex-1 flex-col min-h-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <UploadIcon className="size-8 text-primary" />
            </div>
            <p className="text-sm font-medium text-primary">
              ファイルをドロップしてアップロード
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => router.push("/documents")}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground self-start mt-0.5"
                  aria-label="一覧に戻る"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">一覧に戻る</TooltipContent>
            </Tooltip>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {editingHeaderName ? (
                  <form
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditingHeaderName(false);
                      saveMutation.mutate({ name: kbName });
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setEditingHeaderName(true)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          aria-label="名前を編集"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>名前を編集</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
              {/* Description */}
              {editingDescription ? (
                <form
                  className="flex items-center gap-1.5 mt-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditingDescription(false);
                    saveMutation.mutate({ description: kbDescription });
                  }}
                >
                  <Input
                    autoFocus
                    value={kbDescription}
                    onChange={(e) => setKbDescription(e.target.value)}
                    placeholder="ナレッジベースの説明を入力..."
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setKbDescription(kb?.description ?? "");
                        setEditingDescription(false);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <CheckIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    onClick={() => {
                      setKbDescription(kb?.description ?? "");
                      setEditingDescription(false);
                    }}
                  >
                    <XIcon className="size-3" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDescription(true)}
                  className="group/desc flex items-center gap-1.5 mt-1 text-left"
                >
                  <p className="text-xs text-muted-foreground truncate max-w-md">
                    {kb?.description || "説明を追加..."}
                  </p>
                  <PencilIcon className="size-3 shrink-0 text-muted-foreground/50 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 self-start">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx,.html,.htm,.png,.jpg,.jpeg,.gif,.webp"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/graph/${slug}`}>
                  <NetworkIcon className="size-3.5" />
                  グラフ
                </Link>
              </Button>
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
                ナレッジベースを削除
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
      <ScrollArea className="flex-1 min-h-0">
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
                  ファイルをドラッグ&ドロップ、またはボタンからアップロード
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
                          totalChunks={doc.total_chunks}
                          processedChunks={doc.processed_chunks}
                        />
                      </div>
                    </div>
                    {doc.file_id && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/api/kb-files/${doc.file_id}?dl=1`}
                            download
                            className="flex size-7 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            aria-label={`${doc.name} をダウンロード`}
                          >
                            <DownloadIcon className="size-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>ダウンロード</TooltipContent>
                      </Tooltip>
                    )}
                    {doc.status === "failed" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              setError(null);
                              resumeMutation.mutate(doc);
                            }}
                            disabled={resumingId === doc.id}
                            aria-label={`${doc.name} を続行`}
                          >
                            {resumingId === doc.id ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <PlayIcon className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>続行</TooltipContent>
                      </Tooltip>
                    )}
                    {doc.status === "failed" && doc.file_id && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              setError(null);
                              retryMutation.mutate(doc);
                            }}
                            disabled={retryingId === doc.id}
                            aria-label={`${doc.name} を最初からリトライ`}
                          >
                            {retryingId === doc.id ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <RotateCcwIcon className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>最初からリトライ</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className={`shrink-0 transition-opacity text-muted-foreground hover:text-destructive ${
                            doc.status && IN_PROGRESS_STATUSES.includes(doc.status)
                              ? ""
                              : "opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={() => setDeleteTarget(doc)}
                          disabled={deletingId === doc.id}
                          aria-label={
                            doc.status && IN_PROGRESS_STATUSES.includes(doc.status)
                              ? `${doc.name} をキャンセル`
                              : `${doc.name} を削除`
                          }
                        >
                          {deletingId === doc.id ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : doc.status && IN_PROGRESS_STATUSES.includes(doc.status) ? (
                            <XIcon className="size-3.5" />
                          ) : (
                            <TrashIcon className="size-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {doc.status && IN_PROGRESS_STATUSES.includes(doc.status)
                          ? "キャンセル"
                          : "削除"}
                      </TooltipContent>
                    </Tooltip>
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
          {(() => {
            const isCancelling = deleteTarget?.status != null && IN_PROGRESS_STATUSES.includes(deleteTarget.status);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isCancelling ? "処理をキャンセル" : "ドキュメントを削除"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    「{deleteTarget?.name}」{isCancelling
                      ? "の処理をキャンセルしますか？"
                      : "を削除しますか？この操作は取り消せません。"}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>戻る</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteTarget && confirmDelete(deleteTarget)}
                  >
                    {isCancelling ? "キャンセル" : "削除"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
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
