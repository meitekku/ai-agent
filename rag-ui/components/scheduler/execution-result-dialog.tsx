"use client";

import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  MaximizeIcon,
  CopyIcon,
  DownloadIcon,
  WrenchIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  FileTextIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Streamdown, type PluginConfig } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { formatDate, formatDuration, statusBadge } from "@/components/scheduler-shared";
import { useSchedulerDetailStore, type TaskExecution } from "@/lib/scheduler-detail-store";

const mdPlugins = { cjk, code } as PluginConfig;

interface ToolCallLog {
  tool: string;
  args: Record<string, string>;
  result_summary: string;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Dialog body
// ---------------------------------------------------------------------------

const ExecutionResultContent = memo(function ExecutionResultContent({
  exec,
  taskName,
}: {
  exec: TaskExecution;
  taskName: string;
}) {
  const closeResult = useSchedulerDetailStore((s) => s.closeResult);
  const [toolsOpen, setToolsOpen] = useState(false);

  const handleCopy = useCallback(() => {
    const text = exec.result || exec.error || "";
    navigator.clipboard.writeText(text).then(() => toast.success("コピーしました"));
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
        <span className="text-xs text-muted-foreground">実行 #{exec.id}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(exec.started_at || exec.created_at, true)}
        </span>
        {exec.execution_ms != null && (
          <span className="text-xs text-muted-foreground">{formatDuration(exec.execution_ms)}</span>
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
                  if (document.fullscreenElement) document.exitFullscreen();
                  else document.documentElement.requestFullscreen();
                }}
              >
                <MaximizeIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>全画面 (F11)</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon-sm" onClick={closeResult}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
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

        {!hasResult && !hasError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <FileTextIcon className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">結果がありません</p>
          </div>
        )}

        {toolCalls.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setToolsOpen((o) => !o)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <WrenchIcon className="size-3.5" />
              <span className="font-medium">AIアクション ({toolCalls.length})</span>
              <ChevronRightIcon className={`size-3.5 transition-transform ${toolsOpen ? "rotate-90" : ""}`} />
            </button>
            {toolsOpen && (
              <div className="mt-2 space-y-1.5">
                {toolCalls.map((tc, i) => (
                  <div key={i} className="rounded-md bg-muted/30 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-primary/80 font-medium">{tc.tool}</code>
                      {tc.duration_ms != null && (
                        <span className="text-muted-foreground">{formatDuration(tc.duration_ms)}</span>
                      )}
                    </div>
                    {tc.result_summary && (
                      <p className="text-muted-foreground mt-1 truncate">{tc.result_summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {exec.files && exec.files.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <FileTextIcon className="size-3.5" />
              <span className="font-medium">添付ファイル ({exec.files.length})</span>
            </div>
            <div className="space-y-1.5">
              {exec.files.map((f) => (
                <div key={f.file_id} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2">
                  <FileTextIcon className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.filename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.media_type}
                      {f.size_bytes != null &&
                        ` · ${f.size_bytes < 1024 ? `${f.size_bytes}B` : `${(f.size_bytes / 1024).toFixed(1)}KB`}`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
                    <a href={`/api/task-files/${f.file_id}`} download={f.filename}>
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

      {/* Footer */}
      {(hasResult || hasError) && (
        <div className="flex items-center gap-2 pt-3 border-t border-border/50 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
            <CopyIcon className="size-3.5" />
            コピー
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
            <DownloadIcon className="size-3.5" />
            .md をダウンロード
          </Button>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Dialog wrapper — subscribes only to resultOpen/viewingExec
// ---------------------------------------------------------------------------

export const ResultDialog = memo(function ResultDialog({ taskName }: { taskName: string }) {
  const resultOpen = useSchedulerDetailStore((s) => s.resultOpen);
  const viewingExec = useSchedulerDetailStore((s) => s.viewingExec);
  const closeResult = useSchedulerDetailStore((s) => s.closeResult);

  return (
    <Dialog open={resultOpen} onOpenChange={(open) => { if (!open) closeResult(); }}>
      <DialogContent
        className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        {viewingExec && <ExecutionResultContent exec={viewingExec} taskName={taskName} />}
      </DialogContent>
    </Dialog>
  );
});
