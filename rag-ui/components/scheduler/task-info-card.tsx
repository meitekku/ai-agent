"use client";

import { memo } from "react";
import { Switch } from "@/components/ui/switch";
import {
  CalendarClockIcon,
  ClockIcon,
  HandIcon,
  RotateCcwIcon,
  BrainIcon,
  CpuIcon,
} from "lucide-react";
import { Streamdown, type PluginConfig } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import {
  MANUAL_CRON,
  describeSchedule,
  formatDate,
  modelLabel,
} from "@/components/scheduler-shared";
import type { ScheduledTask } from "@/lib/scheduler-detail-store";

const mdPlugins = { cjk, code } as PluginConfig;

export const TaskInfoCard = memo(function TaskInfoCard({
  task,
  onToggle,
}: {
  task: ScheduledTask;
  onToggle: (enabled: boolean) => void;
}) {
  const isManual = task.cron_expr === MANUAL_CRON;

  return (
    <div className="rounded-xl border border-border/50 p-5 space-y-4">
      {task.description && (
        <p className="text-sm text-muted-foreground">{task.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          {isManual ? <HandIcon className="size-4 shrink-0" /> : <ClockIcon className="size-4 shrink-0" />}
          <div>
            <div className="text-xs text-muted-foreground/70">スケジュール</div>
            <div className="font-medium text-foreground">
              {describeSchedule(task.cron_expr)}
              {!isManual && task.timezone && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">({task.timezone.replace(/^.*\//, "")})</span>
              )}
            </div>
          </div>
        </div>
        {!isManual && (
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <CalendarClockIcon className="size-4 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground/70">次回実行</div>
              <div className="font-medium text-foreground">
                {task.enabled ? formatDate(task.next_run_at, true) : "停止中"}
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
              <div className="font-medium text-foreground">{formatDate(task.last_run_at, true)}</div>
            </div>
          </div>
        )}
      </div>

      {!isManual && (
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-sm text-muted-foreground">自動実行</span>
          <Switch checked={task.enabled} onCheckedChange={onToggle} />
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
  );
});
