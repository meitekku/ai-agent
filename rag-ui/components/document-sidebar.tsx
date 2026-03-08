"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FileTextIcon, TrashIcon, UploadIcon, Loader2Icon, AlertCircleIcon } from "lucide-react";

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

interface DocumentSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// ---------------------------------------------------------------------------
// Hoisted static elements
// ---------------------------------------------------------------------------

const emptyDocumentList = (
  <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
    <FileTextIcon className="size-8 opacity-40" />
    <p>ドキュメントがありません</p>
    <p className="text-xs">PDF をアップロードしてナレッジベースを構築しましょう</p>
  </div>
);

// ---------------------------------------------------------------------------
// DocumentSidebar — using Sheet component
// ---------------------------------------------------------------------------

export const DocumentSidebar = memo(function DocumentSidebar({
  open,
  onOpenChange,
}: DocumentSidebarProps) {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // -- Data fetching --------------------------------------------------------

  const { data: documents = [], isPending: loading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    enabled: open,
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs) return false;
      const hasPending = docs.some((d) => IN_PROGRESS_STATUSES.includes(d.status ?? ""));
      return hasPending ? 5000 : false;
    },
  });

  // -- Upload ---------------------------------------------------------------

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    },
  });

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  // -- Delete ---------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentInfo) => {
      setDeletingId(doc.id);
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const confirmDelete = useCallback(
    (doc: DocumentInfo) => {
      setDeleteTarget(null);
      setError(null);
      deleteMutation.mutate(doc);
    },
    [deleteMutation],
  );

  // -- Render ---------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 sm:max-w-72 p-0 flex flex-col">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle>ドキュメント</SheetTitle>
          <SheetDescription className="sr-only">ナレッジベースのドキュメント管理</SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Upload */}
        <div className="p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            className="w-full gap-2 transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-4" />
            PDF をアップロード
          </Button>
        </div>

        {/* Error */}
        {error ? (
          <div className="mx-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        <Separator />

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            emptyDocumentList
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="group flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <FileTextIcon className="mt-0.5 size-4 shrink-0 text-primary/70" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    {doc.page_count > 0 && (
                      <p className="text-xs text-muted-foreground">{doc.page_count} ページ</p>
                    )}
                    {doc.status === "uploading" && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Loader2Icon className="size-3 animate-spin" />
                        アップロード中...
                      </span>
                    )}
                    {doc.status === "ocr" && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Loader2Icon className="size-3 animate-spin" />
                        OCR 処理中...
                      </span>
                    )}
                    {doc.status === "indexing" && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-500">
                        <Loader2Icon className="size-3 animate-spin" />
                        インデックス作成中...
                      </span>
                    )}
                    {(doc.status === "extracting" || doc.status === "processing") && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-500">
                        <Loader2Icon className="size-3 animate-spin" />
                        実体抽出中...
                      </span>
                    )}
                    {doc.status === "failed" && (
                      <span className="text-xs text-destructive" title={doc.error_msg || undefined}>
                        失敗
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>

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
    </Sheet>
  );
});
