"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  CalendarClockIcon,
  PlusIcon,
  Loader2Icon,
  AlertCircleIcon,
  ClockIcon,
  PlayIcon,
  HandIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/page-container";
import {
  type TaskFormValues,
  MANUAL_CRON,
  ALL_TOOLS,
  configToCron,
  describeSchedule,
  TaskFormFields,
} from "@/components/scheduler-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledTask {
  id: number;
  name: string;
  description: string;
  cron_expr: string;
  timezone: string;
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchTasks(): Promise<ScheduledTask[]> {
  const res = await fetch("/api/scheduler");
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const data = await res.json();
  return data.tasks || [];
}

const INITIAL_FORM: TaskFormValues = {
  name: "",
  prompt: "",
  model: "default",
  schedule: {
    frequency: "daily",
    daysOfWeek: [1],
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
  },
};

// ---------------------------------------------------------------------------
// SchedulerPage
// ---------------------------------------------------------------------------

export const SchedulerPage = memo(function SchedulerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<TaskFormValues>(INITIAL_FORM);

  const { data: tasks = [], isPending } = useQuery({
    queryKey: ["scheduler-tasks"],
    queryFn: fetchTasks,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const isManual = form.schedule.frequency === "manual";
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          cron_expr: configToCron(form.schedule),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          prompt: form.prompt.trim(),
          allowed_tools: ALL_TOOLS,
          model: form.model === "default" ? null : form.model,
          enabled: !isManual,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "作成に失敗しました");
      }
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      setForm(INITIAL_FORM);
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      toast.success("タスクを作成しました");
      router.push(`/scheduler/${data.id}`);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "作成に失敗しました"),
  });

  const runMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await fetch(`/api/scheduler/${taskId}/run`, { method: "POST" });
      if (!res.ok) throw new Error("実行に失敗しました");
      return res.json() as Promise<{ executionId: number }>;
    },
    onSuccess: () => toast.success("実行を開始しました"),
    onError: () => toast.error("実行に失敗しました"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await fetch(`/api/scheduler/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] }),
    onError: () => toast.error("更新に失敗しました"),
  });

  const canCreate = form.name.trim() && form.prompt.trim();

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border">
        <PageContainer className="py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                スケジュールタスク
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                定時タスクの作成・管理
              </p>
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setForm(INITIAL_FORM);
                setShowCreate(true);
              }}
            >
              <PlusIcon className="size-4" />
              新規タスク
            </Button>
          </div>
        </PageContainer>
      </div>

      {/* Error */}
      {error && (
        <PageContainer className="pt-4">
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
        </PageContainer>
      )}

      {/* Task cards */}
      <ScrollArea className="flex-1 min-h-0">
        <PageContainer className="py-4">
          {isPending ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 rounded-xl border border-border/50 px-5 py-4"
                >
                  <Skeleton className="size-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                    <div className="flex gap-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <CalendarClockIcon className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  スケジュールタスクがありません
                </p>
                <p className="text-sm text-muted-foreground">
                  「新規タスク」ボタンで最初のタスクを作成しましょう
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex items-start gap-4 rounded-xl border border-border/50 px-5 py-4 text-left transition-colors hover:bg-muted/30 hover:border-border"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/scheduler/${task.id}`)}
                    className="flex flex-1 items-start gap-4 text-left min-w-0"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 mt-0.5">
                      {task.cron_expr === MANUAL_CRON ? (
                        <HandIcon className="size-5 text-primary/70" />
                      ) : (
                        <CalendarClockIcon className="size-5 text-primary/70" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                          {task.name}
                        </p>
                        {task.cron_expr !== MANUAL_CRON && (
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
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ClockIcon className="size-3" />
                          {describeSchedule(task.cron_expr)}
                          {task.cron_expr !== MANUAL_CRON && task.timezone && (
                            <span className="text-muted-foreground/60">({task.timezone.replace(/^.*\//, "")})</span>
                          )}
                        </span>
                        {task.cron_expr !== MANUAL_CRON && task.next_run_at && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlayIcon className="size-3" />
                            次回 {formatDate(task.next_run_at)}
                          </span>
                        )}
                        {task.last_run_at && (
                          <span className="text-xs text-muted-foreground">
                            前回 {formatDate(task.last_run_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div
                    className="shrink-0 flex items-center gap-2 mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => runMutation.mutate(task.id)}
                          disabled={runMutation.isPending}
                        >
                          <PlayIcon className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>今すぐ実行</TooltipContent>
                    </Tooltip>
                    {task.cron_expr !== MANUAL_CRON && (
                      <Switch
                        checked={task.enabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: task.id, enabled: checked })
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageContainer>
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新規スケジュールタスク</DialogTitle>
            <DialogDescription>
              AI に定期的に実行させるタスクを設定します。
            </DialogDescription>
          </DialogHeader>
          <TaskFormFields
            values={form}
            onChange={setForm}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
              )}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
