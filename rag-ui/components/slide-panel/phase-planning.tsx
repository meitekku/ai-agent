"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import type { SlideSection, Phase } from "./types";

interface PhasePlanningProps {
  phase: Phase;
  deckTitle: string;
  slideSections: SlideSection[];
  onFetchPlan: () => void;
  onStartGeneration: () => void;
}

export function PhasePlanning({
  phase,
  deckTitle,
  slideSections,
  onFetchPlan,
  onStartGeneration,
}: PhasePlanningProps) {
  if (phase === "planning") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <Loader2Icon className="size-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">構成を生成中...</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <Loader2Icon className="size-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (phase === "plan_ready") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h3 className="text-sm font-semibold mb-3">{deckTitle}</h3>
          {slideSections.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {s.type === "cover"
                    ? "カバー"
                    : s.type === "back-cover"
                      ? "バックカバー"
                      : "コンテンツ"}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3 flex gap-2">
          <button
            onClick={onFetchPlan}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <RefreshCwIcon className="size-3.5" />
            やり直す
          </button>
          <button
            onClick={onStartGeneration}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            生成する
          </button>
        </div>
      </div>
    );
  }

  return null;
}
