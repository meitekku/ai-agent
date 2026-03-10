"use client";

import { memo, useState } from "react";
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
  DatabaseIcon,
  PlusIcon,
  FileTextIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

async function fetchKBs(): Promise<KBInfo[]> {
  const res = await fetch("/api/kbs");
  if (!res.ok) throw new Error("Failed to fetch knowledge bases");
  const data = await res.json();
  return data.knowledge_bases || [];
}

/** Generate a slug: lowercase alphanumeric + random suffix */
function generateSlug(): string {
  const rand = crypto.randomUUID().slice(0, 8);
  return `kb-${rand}`;
}

// ---------------------------------------------------------------------------
// DocumentsPage — KB list
// ---------------------------------------------------------------------------

export const DocumentsPage = memo(function DocumentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: kbs = [], isPending } = useQuery({
    queryKey: ["kbs"],
    queryFn: fetchKBs,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const slug = generateSlug();
      const res = await fetch("/api/kbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "作成に失敗しました");
      }
      return res.json() as Promise<KBInfo>;
    },
    onSuccess: (data) => {
      setNewName("");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["kbs"] });
      router.push(`/documents/${data.slug}`);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "作成に失敗しました"),
  });

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                ナレッジベース
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                ナレッジベースを管理して PDF ドキュメントをアップロード
              </p>
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setNewName("");
                setShowCreate(true);
              }}
            >
              <PlusIcon className="size-4" />
              新規ナレッジベース
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

      {/* KB cards */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {isPending ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : kbs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <DatabaseIcon className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  ナレッジベースがありません
                </p>
                <p className="text-sm text-muted-foreground">
                  「新規ナレッジベース」ボタンで最初のナレッジベースを作成しましょう
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {kbs.map((kb) => (
                <button
                  key={kb.slug}
                  type="button"
                  onClick={() => router.push(`/documents/${kb.slug}`)}
                  className="group flex items-start gap-4 rounded-xl border border-border/50 px-5 py-4 text-left transition-colors hover:bg-muted/30 hover:border-border"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 mt-0.5">
                    <DatabaseIcon className="size-5 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {kb.name}
                    </p>
                    {kb.title && (
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {kb.title}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileTextIcon className="size-3" />
                        {kb.doc_count} ドキュメント
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create KB dialog */}
      <AlertDialog open={showCreate} onOpenChange={setShowCreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新規ナレッジベースを作成</AlertDialogTitle>
            <AlertDialogDescription>
              表示名を入力してください。識別子は自動生成されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="表示名（例: 社内規定集）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  createMutation.mutate();
                }
              }}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              作成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
