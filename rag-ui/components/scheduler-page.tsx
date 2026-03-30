"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  MailIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/page-container";

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

// ---------------------------------------------------------------------------
// Schedule config
// ---------------------------------------------------------------------------

type Frequency = "daily" | "weekly" | "monthly" | "manual";

interface ScheduleConfig {
  frequency: Frequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
}

const MANUAL_CRON = "0 0 30 2 *";

const ALL_TOOLS = [
  "searchKnowledgeBase",
  "webSearch",
  "readPage",
  "codeExec",
];

const MODEL_OPTIONS = [
  { value: "default", label: "デフォルト (3 Flash)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];

function configToCron(c: ScheduleConfig): string {
  if (c.frequency === "manual") return MANUAL_CRON;
  const m = String(c.minute);
  const h = String(c.hour);
  if (c.frequency === "daily") return `${m} ${h} * * *`;
  if (c.frequency === "weekly") return `${m} ${h} * * ${c.dayOfWeek}`;
  return `${m} ${h} ${c.dayOfMonth} * *`;
}

function cronToConfig(cron: string): ScheduleConfig {
  if (cron === MANUAL_CRON)
    return { frequency: "manual", dayOfWeek: 1, dayOfMonth: 1, hour: 9, minute: 0 };
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5)
    return { frequency: "daily", dayOfWeek: 1, dayOfMonth: 1, hour: 9, minute: 0 };
  const min = parseInt(p[0]) || 0;
  const hour = parseInt(p[1]) || 0;
  if (p[4] !== "*" && p[2] === "*")
    return { frequency: "weekly", dayOfWeek: parseInt(p[4]) || 1, dayOfMonth: 1, hour, minute: min };
  if (p[2] !== "*" && p[4] === "*")
    return { frequency: "monthly", dayOfWeek: 1, dayOfMonth: parseInt(p[2]) || 1, hour, minute: min };
  return { frequency: "daily", dayOfWeek: 1, dayOfMonth: 1, hour, minute: min };
}

function describeSchedule(cron: string): string {
  const c = cronToConfig(cron);
  if (c.frequency === "manual") return "手動実行のみ";
  const time = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
  if (c.frequency === "daily") return `毎日 ${time}`;
  if (c.frequency === "weekly") {
    const d = DAYS_OF_WEEK.find((d) => d.value === c.dayOfWeek);
    return `毎週${d?.label || ""}曜日 ${time}`;
  }
  return `毎月${c.dayOfMonth}日 ${time}`;
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

// ---------------------------------------------------------------------------
// Schedule Picker
// ---------------------------------------------------------------------------

function SchedulePicker({
  value,
  onChange,
}: {
  value: ScheduleConfig;
  onChange: (v: ScheduleConfig) => void;
}) {
  const set = (patch: Partial<ScheduleConfig>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(
          [
            { key: "daily", label: "毎日" },
            { key: "weekly", label: "毎週" },
            { key: "monthly", label: "毎月" },
            { key: "manual", label: "手動のみ" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => set({ frequency: key })}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              value.frequency === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.frequency !== "manual" && (
        <div className="flex items-center gap-3 flex-wrap">
          {value.frequency === "weekly" && (
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => set({ dayOfWeek: d.value })}
                  className={`flex size-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                    value.dayOfWeek === d.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          {value.frequency === "monthly" && (
            <Select
              value={String(value.dayOfMonth)}
              onValueChange={(v) => set({ dayOfMonth: parseInt(v, 10) })}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}日
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <Select
              value={String(value.hour)}
              onValueChange={(v) => set({ hour: parseInt(v, 10) })}
            >
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {String(i).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">:</span>
            <Select
              value={String(value.minute)}
              onValueChange={(v) => set({ minute: parseInt(v, 10) })}
            >
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {String(m).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {value.frequency === "manual"
          ? "自動実行せず、手動で実行します"
          : `スケジュール: ${describeSchedule(configToCron(value))}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface CreateForm {
  name: string;
  description: string;
  prompt: string;
  model: string;
  schedule: ScheduleConfig;
}

const INITIAL_FORM: CreateForm = {
  name: "",
  description: "",
  prompt: "",
  model: "default",
  schedule: {
    frequency: "daily",
    dayOfWeek: 1,
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
  const [form, setForm] = useState<CreateForm>(INITIAL_FORM);

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
          description: form.description.trim(),
          cron_expr: configToCron(form.schedule),
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

  const canCreate =
    form.name.trim() && form.description.trim() && form.prompt.trim();

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
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ClockIcon className="size-3" />
                          {describeSchedule(task.cron_expr)}
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
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-name">タスク名</Label>
                <Input
                  id="task-name"
                  placeholder="例: 週次レポート生成"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>モデル</Label>
                <Select
                  value={form.model}
                  onValueChange={(v) => setForm((f) => ({ ...f, model: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-desc">説明</Label>
              <Input
                id="task-desc"
                placeholder="このタスクが何をするか、結果をどう使うか"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>実行スケジュール</Label>
              <SchedulePicker
                value={form.schedule}
                onChange={(schedule) => setForm((f) => ({ ...f, schedule }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-prompt">タスク指示</Label>
              <Textarea
                id="task-prompt"
                placeholder={"AI に実行させたい内容を自然言語で記述してください...\n\n例: 直近1週間のナレッジベースの更新内容をまとめて、重要な変更点をレポートにしてください。"}
                rows={5}
                value={form.prompt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, prompt: e.target.value }))
                }
              />
            </div>

            {/* Email hint */}
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
              <MailIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                タスク指示に「結果を xxx@example.com にメールで送信してください」と書くと、
                AI が自動的にメールで結果を通知します。
              </p>
            </div>
          </div>
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
