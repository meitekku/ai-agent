"use client";

import { memo, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ArrowLeftIcon,
  PlayIcon,
  PencilIcon,
  Trash2Icon,
  Loader2Icon,
  AlertCircleIcon,
  CalendarClockIcon,
  ClockIcon,
  HandIcon,
  RotateCcwIcon,
  BrainIcon,
  WrenchIcon,
  CpuIcon,
  MaximizeIcon,
  CopyIcon,
  DownloadIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  FileTextIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Streamdown, type PluginConfig } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { PageContainer } from "@/components/page-container";
import {
  type ScheduleConfig,
  type TaskFormValues,
  MANUAL_CRON,
  ALL_TOOLS,
  MODEL_OPTIONS,
  configToCron,
  cronToConfig,
  describeSchedule,
  TaskFormFields,
} from "@/components/scheduler-shared";

const mdPlugins = { cjk, code } as PluginConfig;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledTask {
  id: number;
  name: string;
  description: string;
  cron_expr: string;
  prompt: string;
  kb_slug: string | null;
  allowed_tools: string[];
  max_tool_calls: number;
  timeout_sec: number;
  retry_max: number;
  model: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionFileInfo {
  file_id: string;
  filename: string;
  media_type: string;
  size_bytes: number | null;
}

interface TaskExecution {
  id: number;
  task_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  tool_calls: unknown[];
  result: string | null;
  error: string | null;
  retry_count: number;
  execution_ms: number | null;
  created_at: string;
  files?: ExecutionFileInfo[];
}

// ---------------------------------------------------------------------------
// Schedule config
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-transparent">完了</Badge>;
    case "failed":
      return <Badge variant="destructive">失敗</Badge>;
    case "timeout":
      return <Badge className="bg-amber-500/10 text-amber-600 border-transparent">タイムアウト</Badge>;
    case "running":
      return <Badge className="bg-blue-500/10 text-blue-600 border-transparent animate-pulse">実行中</Badge>;
    case "queued":
      return <Badge variant="outline">キュー中</Badge>;
    default:
      return <Badge variant="outline">待機中</Badge>;
  }
}

function modelLabel(model: string | null): string {
  if (!model) return "Gemini 3 Flash（デフォルト）";
  return MODEL_OPTIONS.find((o) => o.value === model)?.label || model;
}

// ---------------------------------------------------------------------------
// Skeletons
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

function ExecutionsSkeleton() {
  return (
    <div className="grid gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExecutionResultContent — Dialog 内容
// ---------------------------------------------------------------------------

interface ToolCallLog {
  tool: string;
  args: Record<string, string>;
  result_summary: string;
  duration_ms: number;
}

function ExecutionResultContent({
  exec,
  taskName,
  onClose,
}: {
  exec: TaskExecution;
  taskName: string;
  onClose: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);

  const handleCopy = useCallback(() => {
    const text = exec.result || exec.error || "";
    navigator.clipboard.writeText(text).then(() => {
      toast.success("コピーしました");
    });
  }, [exec]);

  const handleDownload = useCallback(() => {
    const text = exec.result || exec.error || "";
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${taskName}-${exec.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exec, taskName]);

  const toolCalls = (exec.tool_calls || []) as ToolCallLog[];
  const hasResult = !!exec.result;
  const hasError = !!exec.error;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/50 shrink-0">
        {statusBadge(exec.status)}
        <span className="text-xs text-muted-foreground">
          実行 #{exec.id}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(exec.started_at || exec.created_at)}
        </span>
        {exec.execution_ms != null && (
          <span className="text-xs text-muted-foreground">
            {formatDuration(exec.execution_ms)}
          </span>
        )}
        {(exec.prompt_tokens || exec.output_tokens) && (
          <span className="text-xs text-muted-foreground">
            {exec.prompt_tokens ?? 0}+{exec.output_tokens ?? 0} tokens
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    document.documentElement.requestFullscreen();
                  }
                }}
              >
                <MaximizeIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>全画面 (F11)</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
        {/* Error */}
        {hasError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangleIcon className="size-4 text-destructive shrink-0" />
              <span className="text-xs font-medium text-destructive">エラー</span>
            </div>
            <div className="text-xs text-destructive font-mono whitespace-pre-wrap break-words">
              {exec.error}
            </div>
          </div>
        )}

        {/* Result — Markdown rendered */}
        {hasResult && (
          <div className="prose-sm max-w-none overflow-x-auto break-words [overflow-wrap:anywhere]">
            <Streamdown
              className="sd text-xs leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_pre]:text-[11px] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:text-[11px] [&_code]:break-all [&_p]:text-xs [&_li]:text-xs [&_table]:text-xs"
              plugins={mdPlugins}
            >
              {exec.result!}
            </Streamdown>
          </div>
        )}

        {/* No content */}
        {!hasResult && !hasError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <FileTextIcon className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">結果がありません</p>
          </div>
        )}

        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setToolsOpen((o) => !o)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <WrenchIcon className="size-3.5" />
              <span className="font-medium">ツールコール ({toolCalls.length})</span>
              <ChevronRightIcon
                className={`size-3.5 transition-transform ${toolsOpen ? "rotate-90" : ""}`}
              />
            </button>
            {toolsOpen && (
              <div className="mt-2 space-y-1.5">
                {toolCalls.map((tc, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-muted/30 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-primary/80 font-medium">
                        {tc.tool}
                      </code>
                      {tc.duration_ms != null && (
                        <span className="text-muted-foreground">
                          {formatDuration(tc.duration_ms)}
                        </span>
                      )}
                    </div>
                    {tc.result_summary && (
                      <p className="text-muted-foreground mt-1 truncate">
                        {tc.result_summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attached files */}
        {exec.files && exec.files.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <FileTextIcon className="size-3.5" />
              <span className="font-medium">
                添付ファイル ({exec.files.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {exec.files.map((f) => (
                <div
                  key={f.file_id}
                  className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2"
                >
                  <FileTextIcon className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {f.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.media_type}
                      {f.size_bytes != null &&
                        ` · ${f.size_bytes < 1024 ? `${f.size_bytes}B` : `${(f.size_bytes / 1024).toFixed(1)}KB`}`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    asChild
                  >
                    <a
                      href={`/api/task-files/${f.file_id}`}
                      download={f.filename}
                    >
                      <DownloadIcon className="size-3" />
                      ダウンロード
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer — actions */}
      {(hasResult || hasError) && (
        <div className="flex items-center gap-2 pt-3 border-t border-border/50 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopy}
          >
            <CopyIcon className="size-3.5" />
            コピー
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDownload}
          >
            <DownloadIcon className="size-3.5" />
            .md をダウンロード
          </Button>
        </div>
      )}
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

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editForm, setEditForm] = useState<TaskFormValues | null>(null);
  const [viewingExec, setViewingExec] = useState<TaskExecution | null>(null);

  const {
    data: task,
    isPending,
    error: fetchError,
  } = useQuery({
    queryKey: ["scheduler-task", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}`);
      if (!res.ok) throw new Error("タスクの取得に失敗しました");
      const data = await res.json();
      return data.task as ScheduledTask;
    },
  });

  const { data: executions = [], isPending: execLoading } = useQuery({
    queryKey: ["scheduler-executions", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}/executions`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.executions as TaskExecution[];
    },
    refetchInterval: 15000,
  });

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
      setShowEdit(false);
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

  function openEdit() {
    if (!task) return;
    setEditForm({
      name: task.name,
      description: task.description,
      prompt: task.prompt,
      model: task.model || "default",
      schedule: cronToConfig(task.cron_expr),
    });
    setShowEdit(true);
  }

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
                <h2 className="text-lg font-semibold tracking-tight truncate">
                  {task.name}
                </h2>
                {!isManual && (
                  <Badge
                    variant={task.enabled ? "default" : "outline"}
                    className={
                      task.enabled
                        ? "bg-emerald-500/10 text-emerald-600 border-transparent"
                        : ""
                    }
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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
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
          {/* Task Info Card */}
          <div className="rounded-xl border border-border/50 p-5 space-y-4">
            {task.description && (
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                {isManual ? <HandIcon className="size-4 shrink-0" /> : <ClockIcon className="size-4 shrink-0" />}
                <div>
                  <div className="text-xs text-muted-foreground/70">スケジュール</div>
                  <div className="font-medium text-foreground">{describeSchedule(task.cron_expr)}</div>
                </div>
              </div>
              {!isManual && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <CalendarClockIcon className="size-4 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground/70">次回実行</div>
                    <div className="font-medium text-foreground">
                      {task.enabled ? formatDate(task.next_run_at) : "停止中"}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <CpuIcon className="size-4 shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground/70">モデル</div>
                  <div className="font-medium text-foreground">{modelLabel(task.model)}</div>
                </div>
              </div>
              {task.last_run_at && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <RotateCcwIcon className="size-4 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground/70">最終実行</div>
                    <div className="font-medium text-foreground">{formatDate(task.last_run_at)}</div>
                  </div>
                </div>
              )}
            </div>

            {!isManual && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-sm text-muted-foreground">自動実行</span>
                <Switch
                  checked={task.enabled}
                  onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                />
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
                <BrainIcon className="size-3.5" />
                タスク指示
              </div>
              <div className="rounded-lg bg-muted/30 p-3 prose-sm max-w-none break-words">
                <Streamdown
                  className="sd text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_pre]:text-[11px] [&_code]:text-[11px] [&_p]:text-xs [&_li]:text-xs [&_table]:text-xs"
                  plugins={mdPlugins}
                >
                  {task.prompt}
                </Streamdown>
              </div>
            </div>
          </div>

          {/* Execution History */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">実行履歴</h3>
            </div>
            <Separator className="mb-3" />

            {execLoading ? (
              <ExecutionsSkeleton />
            ) : executions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <RotateCcwIcon className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">まだ実行履歴がありません</p>
                <p className="text-xs text-muted-foreground">「実行」ボタンでタスクを手動実行できます</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {executions.map((exec) => {
                  const hasDetail = exec.result || exec.error;
                  const preview = (exec.result || exec.error || "").slice(0, 300);
                  return (
                    <button
                      key={exec.id}
                      type="button"
                      onClick={() => hasDetail && setViewingExec(exec)}
                      className={`w-full rounded-lg border border-border/50 px-4 py-3 text-left text-sm transition-colors ${
                        hasDetail ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {statusBadge(exec.status)}
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(exec.started_at || exec.created_at)}
                        </span>
                        {exec.execution_ms != null && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDuration(exec.execution_ms)}
                          </span>
                        )}
                        {hasDetail && (
                          <ChevronRightIcon className="size-4 text-muted-foreground ml-auto shrink-0" />
                        )}
                      </div>
                      {preview && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 break-words">
                          {preview}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </PageContainer>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>タスクを編集</DialogTitle>
            <DialogDescription>タスクの設定を変更します。</DialogDescription>
          </DialogHeader>
          {editForm && (
            <TaskFormFields
              values={editForm}
              onChange={(v) => setEditForm(v)}
              autoFocus
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>キャンセル</Button>
            <Button
              onClick={() => {
                if (!editForm) return;
                const isManualNew = editForm.schedule.frequency === "manual";
                updateMutation.mutate({
                  name: editForm.name.trim(),
                  description: editForm.description.trim(),
                  cron_expr: configToCron(editForm.schedule),
                  prompt: editForm.prompt.trim(),
                  model: editForm.model === "default" ? null : editForm.model,
                  allowed_tools: ALL_TOOLS,
                  enabled: isManualNew ? false : task.enabled,
                });
              }}
              disabled={
                !editForm?.name.trim() ||
                !editForm?.description.trim() ||
                !editForm?.prompt.trim() ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>タスクを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{task.name}」を削除しますか？実行履歴も全て削除されます。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Execution Result Dialog */}
      <Dialog
        open={!!viewingExec}
        onOpenChange={(open) => {
          if (!open) setViewingExec(null);
        }}
      >
        <DialogContent
          className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          showCloseButton={false}
        >
          {viewingExec && (
            <ExecutionResultContent
              exec={viewingExec}
              taskName={task.name}
              onClose={() => setViewingExec(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
