"use client";

import { memo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  ArrowLeftIcon,
  PlayIcon,
  PencilIcon,
  Trash2Icon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/page-container";
import { MANUAL_CRON, cronToConfig } from "@/components/scheduler-shared";
import {
  useSchedulerDetailStore,
  type ScheduledTask,
} from "@/lib/scheduler-detail-store";

// Sub-components (each memo'd, each subscribes to own store slice)
import { TaskInfoCard } from "@/components/scheduler/task-info-card";
import { ExecutionList } from "@/components/scheduler/execution-list";
import { ResultDialog } from "@/components/scheduler/execution-result-dialog";
import { EditDialog } from "@/components/scheduler/edit-dialog";
import { DeleteDialog } from "@/components/scheduler/delete-dialog";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 border-b border-border">
        <PageContainer className="py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-6 rounded" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        </PageContainer>
      </div>
      <PageContainer className="py-4 space-y-6">
        <div className="rounded-xl border border-border/50 p-5 space-y-4">
          <Skeleton className="h-4 w-3/4" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </PageContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchedulerDetailPage
// ---------------------------------------------------------------------------

export const SchedulerDetailPage = memo(function SchedulerDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const taskId = parseInt(id, 10);
  const queryClient = useQueryClient();

  const openEdit = useSchedulerDetailStore((s) => s.openEdit);
  const closeEdit = useSchedulerDetailStore((s) => s.closeEdit);
  const setShowDelete = useSchedulerDetailStore((s) => s.setShowDelete);

  // ---- Data fetching ----

  const { data: task, isPending, error: fetchError } = useQuery({
    queryKey: ["scheduler-task", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}`);
      if (!res.ok) throw new Error("タスクの取得に失敗しました");
      return ((await res.json()) as { task: ScheduledTask }).task;
    },
  });

  // ---- Mutations ----

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}/run`, { method: "POST" });
      if (!res.ok) throw new Error("実行のトリガーに失敗しました");
      return res.json() as Promise<{ executionId: number }>;
    },
    onSuccess: (data) => {
      toast.success(`実行を開始しました (ID: ${data.executionId})`);
      queryClient.invalidateQueries({ queryKey: ["scheduler-executions", taskId] });
    },
    onError: () => toast.error("実行のトリガーに失敗しました"),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/scheduler/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
    },
    onSuccess: () => {
      closeEdit();
      queryClient.invalidateQueries({ queryKey: ["scheduler-task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      toast.success("タスクを更新しました");
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      toast.success("タスクを削除しました");
      router.push("/scheduler");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/scheduler/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const handleOpenEdit = useCallback(() => {
    if (!task) return;
    openEdit({
      name: task.name,
      description: task.description,
      prompt: task.prompt,
      model: task.model || "default",
      schedule: cronToConfig(task.cron_expr),
    });
  }, [task, openEdit]);

  // ---- Loading / Error ----

  if (isPending) return <DetailSkeleton />;

  if (fetchError || !task) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <AlertCircleIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">タスクが見つかりませんでした</p>
        <Button variant="outline" onClick={() => router.push("/scheduler")}>
          <ArrowLeftIcon className="size-4 mr-1.5" />
          一覧に戻る
        </Button>
      </div>
    );
  }

  const isManual = task.cron_expr === MANUAL_CRON;

  // ---- Render ----

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border">
        <PageContainer className="py-4">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => router.push("/scheduler")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>一覧に戻る</TooltipContent>
            </Tooltip>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight truncate">{task.name}</h2>
                {!isManual && (
                  <Badge
                    variant={task.enabled ? "default" : "outline"}
                    className={task.enabled ? "bg-emerald-500/10 text-emerald-600 border-transparent" : ""}
                  >
                    {task.enabled ? "有効" : "停止中"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                {runMutation.isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
                実行
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpenEdit}>
                <PencilIcon className="size-3.5" />
                編集
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDelete(true)}
              >
                <Trash2Icon className="size-3.5" />
                削除
              </Button>
            </div>
          </div>
        </PageContainer>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <PageContainer className="py-4 space-y-6">
          <TaskInfoCard task={task} onToggle={(v) => toggleMutation.mutate(v)} />
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">実行履歴</h3>
            </div>
            <Separator className="mb-3" />
            <ExecutionList taskId={taskId} />
          </div>
        </PageContainer>
      </ScrollArea>

      {/* Dialogs — each isolated, subscribe to own store slice */}
      <EditDialog task={task} onSave={(d) => updateMutation.mutate(d)} saving={updateMutation.isPending} />
      <DeleteDialog taskName={task.name} onDelete={() => deleteMutation.mutate()} deleting={deleteMutation.isPending} />
      <ResultDialog taskName={task.name} />
    </div>
  );
});
