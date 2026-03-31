"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MailIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type Frequency = "daily" | "weekly" | "monthly" | "manual";

export interface ScheduleConfig {
  frequency: Frequency;
  daysOfWeek: number[];
  dayOfMonth: number;
  hour: number;
  minute: number;
}

export const MANUAL_CRON = "0 0 30 2 *";

export const ALL_TOOLS = [
  "searchKnowledgeBase",
  "webSearch",
  "readUrl",
  "executeCode",
  "crmApi",
  "createFile",
  "sendEmail",
  "analyzeImage",
  "readFile",
  "httpRequest",
  "queryDatabase",
  "editFile",
  "listFiles",
  "grepFiles",
];

export const MODEL_OPTIONS = [
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

// ---------------------------------------------------------------------------
// Cron helpers
// ---------------------------------------------------------------------------

export function configToCron(c: ScheduleConfig): string {
  if (c.frequency === "manual") return MANUAL_CRON;
  const m = String(c.minute);
  const h = String(c.hour);
  if (c.frequency === "daily") return `${m} ${h} * * *`;
  if (c.frequency === "weekly") {
    const days = c.daysOfWeek.length > 0 ? c.daysOfWeek.join(",") : "1";
    return `${m} ${h} * * ${days}`;
  }
  return `${m} ${h} ${c.dayOfMonth} * *`;
}

export function cronToConfig(cron: string): ScheduleConfig {
  if (cron === MANUAL_CRON)
    return { frequency: "manual", daysOfWeek: [1], dayOfMonth: 1, hour: 9, minute: 0 };
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5)
    return { frequency: "daily", daysOfWeek: [1], dayOfMonth: 1, hour: 9, minute: 0 };
  const min = parseInt(p[0]) || 0;
  const hour = parseInt(p[1]) || 0;
  if (p[4] !== "*" && p[2] === "*") {
    const days = p[4].split(",").map((s) => parseInt(s)).filter((n) => !isNaN(n));
    return { frequency: "weekly", daysOfWeek: days.length > 0 ? days : [1], dayOfMonth: 1, hour, minute: min };
  }
  if (p[2] !== "*" && p[4] === "*")
    return { frequency: "monthly", daysOfWeek: [1], dayOfMonth: parseInt(p[2]) || 1, hour, minute: min };
  return { frequency: "daily", daysOfWeek: [1], dayOfMonth: 1, hour, minute: min };
}

export function describeSchedule(cron: string): string {
  const c = cronToConfig(cron);
  if (c.frequency === "manual") return "手動実行のみ";
  const time = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
  if (c.frequency === "daily") return `毎日 ${time}`;
  if (c.frequency === "weekly") {
    const labels = DAYS_OF_WEEK
      .filter((d) => c.daysOfWeek.includes(d.value))
      .map((d) => d.label);
    return `毎週${labels.join("・")}曜日 ${time}`;
  }
  return `毎月${c.dayOfMonth}日 ${time}`;
}

// ---------------------------------------------------------------------------
// Schedule Picker
// ---------------------------------------------------------------------------

export function SchedulePicker({
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
              {DAYS_OF_WEEK.map((d) => {
                const selected = value.daysOfWeek.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? value.daysOfWeek.filter((v) => v !== d.value)
                        : [...value.daysOfWeek, d.value];
                      set({ daysOfWeek: next.length > 0 ? next : [d.value] });
                    }}
                    className={`flex size-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
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
// Display helpers
// ---------------------------------------------------------------------------

export function formatDate(iso: string | null, includeYear = false): string {
  if (!iso) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (includeYear) opts.year = "numeric";
  return new Date(iso).toLocaleString("ja-JP", opts);
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function statusBadge(status: string) {
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

export function modelLabel(model: string | null): string {
  if (!model) return "Gemini 3 Flash（デフォルト）";
  return MODEL_OPTIONS.find((o) => o.value === model)?.label || model;
}

// ---------------------------------------------------------------------------
// Task Form Fields (shared between create & edit)
// ---------------------------------------------------------------------------

export interface TaskFormValues {
  name: string;
  prompt: string;
  model: string;
  schedule: ScheduleConfig;
}

export function TaskFormFields({
  values,
  onChange,
  autoFocus,
  promptPlaceholder,
}: {
  values: TaskFormValues;
  onChange: (v: TaskFormValues) => void;
  autoFocus?: boolean;
  promptPlaceholder?: string;
}) {
  const set = <K extends keyof TaskFormValues>(key: K, val: TaskFormValues[K]) =>
    onChange({ ...values, [key]: val });

  return (
    <div className="space-y-5 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="task-name">タスク名</Label>
          <Input
            id="task-name"
            placeholder="例: 週次レポート生成"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus={autoFocus}
          />
        </div>
        <div className="space-y-2">
          <Label>モデル</Label>
          <Select
            value={values.model}
            onValueChange={(v) => set("model", v)}
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
        <Label>実行スケジュール</Label>
        <SchedulePicker
          value={values.schedule}
          onChange={(schedule) => set("schedule", schedule)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-prompt">タスク指示</Label>
        <Textarea
          id="task-prompt"
          className="max-h-[40vh] overflow-y-auto"
          placeholder={
            promptPlaceholder ??
            "AI に実行させたい内容を自然言語で記述してください...\n\n例: 直近1週間のナレッジベースの更新内容をまとめて、重要な変更点をレポートにしてください。"
          }
          rows={5}
          value={values.prompt}
          onChange={(e) => set("prompt", e.target.value)}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
        <MailIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          タスク指示に「結果を xxx@example.com にメールで送信してください」と書くと、
          AI が自動的にメールで結果を通知します。
        </p>
      </div>
    </div>
  );
}
