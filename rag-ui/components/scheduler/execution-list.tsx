"use client";

import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcwIcon, ChevronRightIcon } from "lucide-react";
import { formatDate, formatDuration, statusBadge } from "@/components/scheduler-shared";
import { useSchedulerDetailStore, type TaskExecution } from "@/lib/scheduler-detail-store";

export const ExecutionList = memo(function ExecutionList({
  taskId,
}: {
  taskId: number;
}) {
  const openResult = useSchedulerDetailStore((s) => s.openResult);

  const { data: executions = [], isPending } = useQuery({
    queryKey: ["scheduler-executions", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/scheduler/${taskId}/executions`);
      if (!res.ok) return [];
      return ((await res.json()) as { executions: TaskExecution[] }).executions;
    },
    refetchInterval: 15000,
  });

  if (isPending) {
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

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <RotateCcwIcon className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">まだ実行履歴がありません</p>
        <p className="text-xs text-muted-foreground">「実行」ボタンでタスクを手動実行できます</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {executions.map((exec) => {
        const hasDetail = exec.result || exec.error;
        const preview = (exec.result || exec.error || "").slice(0, 300);
        return (
          <button
            key={exec.id}
            type="button"
            onClick={() => hasDetail && openResult(exec)}
            className={`w-full rounded-lg border border-border/50 px-4 py-3 text-left text-sm transition-colors ${
              hasDetail ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"
            }`}
          >
            <div className="flex items-center gap-3">
              {statusBadge(exec.status)}
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDate(exec.started_at || exec.created_at, true)}
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
  );
});
