"use client";

import { memo, useCallback, useOptimistic, useRef, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FileTextIcon,
  TrashIcon,
  Trash2Icon,
  UploadIcon,
  Loader2Icon,
  AlertCircleIcon,
  SparklesIcon,
  SaveIcon,
  DatabaseIcon,
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

interface KbConfig {
  title: string;
  description: string;
}

async function fetchKbConfig(): Promise<KbConfig> {
  const res = await fetch("/api/kb-config");
  if (!res.ok) throw new Error("Failed to fetch KB config");
  return res.json();
}

export const DocumentsPage = memo(function DocumentsPage() {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // KB config state
  const { data: kbConfig } = useQuery({
    queryKey: ["kb-config"],
    queryFn: fetchKbConfig,
  });
  const [kbTitle, setKbTitle] = useState("");
  const [kbDescription, setKbDescription] = useState("");
  const [kbDirty, setKbDirty] = useState(false);
  const kbInitRef = useRef(false);

  // Sync fetched config into local state
  if (kbConfig && !kbInitRef.current) {
    kbInitRef.current = true;
    setKbTitle(kbConfig.title);
    setKbDescription(kbConfig.description);
  }

  const kbSaveMutation = useMutation({
    mutationFn: async ({ title, description }: KbConfig) => {
      const res = await fetch("/api/kb-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      setKbDirty(false);
      queryClient.invalidateQueries({ queryKey: ["kb-config"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "保存に失敗しました"),
  });

  const kbGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/kb-config/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate");
      return res.json() as Promise<KbConfig>;
    },
    onSuccess: (data) => {
      setKbTitle(data.title);
      setKbDescription(data.description);
      setKbDirty(false);
      queryClient.invalidateQueries({ queryKey: ["kb-config"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "自動生成に失敗しました"),
  });

  const handleKbTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setKbTitle(e.target.value);
    setKbDirty(true);
  }, []);

  const handleKbDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setKbDescription(e.target.value);
    setKbDirty(true);
  }, []);

  const { data: documents = [], isPending: loading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs) return false;
      return docs.some((d) => IN_PROGRESS_STATUSES.includes(d.status ?? "")) ? 5000 : false;
    },
  });

  const [optimisticDocs, addOptimisticDoc] = useOptimistic(
    documents,
    (state, newDoc: DocumentInfo) => [newDoc, ...state],
  );

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      if (fileList.length === 0) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
      for (const file of fileList) {
        startTransition(async () => {
          addOptimisticDoc({
            id: `uploading-${Date.now()}`,
            name: file.name.replace(/\.pdf$/i, ""),
            page_count: 0,
            status: "uploading",
          });
          const formData = new FormData();
          formData.append("file", file);
          try {
            const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Upload failed");
            }
            await queryClient.invalidateQueries({ queryKey: ["documents"] });
            // Fire-and-forget KB config regeneration
            fetch("/api/kb-config/generate", { method: "POST" })
              .then(() => {
                kbInitRef.current = false;
                queryClient.invalidateQueries({ queryKey: ["kb-config"] });
              })
              .catch(() => {});
          } catch (err) {
            setError(err instanceof Error ? err.message : "アップロードに失敗しました");
          }
        });
      }
    },
    [addOptimisticDoc, queryClient, kbInitRef],
  );

  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setDeletingId(doc.id);
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // Fire-and-forget KB config regeneration
      fetch("/api/kb-config/generate", { method: "POST" })
        .then(() => {
          kbInitRef.current = false;
          queryClient.invalidateQueries({ queryKey: ["kb-config"] });
        })
        .catch(() => {});
    },
    onError: (err) => setError(err instanceof Error ? err.message : "削除に失敗しました"),
    onSettled: () => setDeletingId(null),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/documents", { method: "DELETE" });
      if (!res.ok) throw new Error("Delete all failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      kbInitRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["kb-config"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "全削除に失敗しました"),
  });

  const confirmDelete = useCallback(
    (doc: DocumentInfo) => {
      setDeleteTarget(null);
      setError(null);
      deleteMutation.mutate(doc);
    },
    [deleteMutation],
  );

  const processedCount = optimisticDocs.filter((d) => d.status === "processed" || !d.status).length;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">ドキュメント</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              ナレッジベースの PDF を管理
              {optimisticDocs.length > 0 && (
                <span className="ml-2 text-xs">
                  ({processedCount} / {optimisticDocs.length} 処理済み)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {optimisticDocs.length > 0 && (
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

      {/* KB Config */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">ナレッジベース設定</span>
            <span className="text-xs text-muted-foreground">— AI がツール判断に使用</span>
          </div>
          <div className="grid gap-3">
            <Input
              placeholder="タイトル（例: 社内規定集）"
              value={kbTitle}
              onChange={handleKbTitleChange}
              className="h-8 text-sm"
            />
            <Textarea
              placeholder="概要（例: 社内規定、就業規則、各種手続きガイドラインを含むドキュメント集）"
              value={kbDescription}
              onChange={handleKbDescriptionChange}
              className="min-h-[60px] resize-none text-sm"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            {kbDirty && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 h-7 text-xs"
                onClick={() => kbSaveMutation.mutate({ title: kbTitle, description: kbDescription })}
                disabled={kbSaveMutation.isPending}
              >
                {kbSaveMutation.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <SaveIcon className="size-3" />}
                保存
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => kbGenerateMutation.mutate()}
              disabled={kbGenerateMutation.isPending}
            >
              {kbGenerateMutation.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
              AI で自動生成
            </Button>
          </div>
        </div>
      </div>

      {/* Document list */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : optimisticDocs.length === 0 ? (
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
              {optimisticDocs.map((doc) => (
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

      {/* Delete all confirmation */}
      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>全ドキュメントを削除</AlertDialogTitle>
            <AlertDialogDescription>
              {optimisticDocs.length} 件のドキュメントを全て削除しますか？ナレッジグラフとベクトルデータも完全に削除されます。この操作は取り消せません。
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
    </div>
  );
});
