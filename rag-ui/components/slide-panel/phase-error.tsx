"use client";

import { RefreshCwIcon } from "lucide-react";

interface PhaseErrorProps {
  error: string | null;
  onRetry: () => void;
}

export function PhaseError({ error, onRetry }: PhaseErrorProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive max-w-full">
        {error || "エラーが発生しました"}
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <RefreshCwIcon className="size-3.5" />
        再試行
      </button>
    </div>
  );
}
