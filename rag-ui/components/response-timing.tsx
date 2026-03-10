"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ClockIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Timestamps captured during streaming
// ---------------------------------------------------------------------------

interface Timestamps {
  submitted: number;
  mounted: number;
  searchStarted: number;
  searchEnded: number;
  textStarted: number;
  completed: number;
}

interface PhaseTiming {
  label: string;
  seconds: number;
}

function buildPhases(ts: Timestamps): PhaseTiming[] {
  const phases: PhaseTiming[] = [];

  const connect = Math.round((ts.mounted - ts.submitted) / 1000);
  if (connect >= 1) phases.push({ label: "LLM 接続", seconds: connect });

  const thinkEnd = ts.searchStarted || ts.textStarted || ts.completed;
  const think = Math.round((thinkEnd - ts.mounted) / 1000);
  if (think >= 1) phases.push({ label: "クエリ分析", seconds: think });

  if (ts.searchStarted && ts.searchEnded) {
    const search = Math.round((ts.searchEnded - ts.searchStarted) / 1000);
    if (search >= 1) phases.push({ label: "KB 検索", seconds: search });
  }

  if (ts.searchEnded) {
    const genEnd = ts.textStarted || ts.completed;
    const gen = Math.round((genEnd - ts.searchEnded) / 1000);
    if (gen >= 1) phases.push({ label: "回答生成", seconds: gen });
  }

  if (ts.textStarted && ts.completed) {
    const stream = Math.round((ts.completed - ts.textStarted) / 1000);
    if (stream >= 1) phases.push({ label: "テキスト出力", seconds: stream });
  }

  return phases;
}

// ---------------------------------------------------------------------------
// Hook: track timestamps across streaming phases
// ---------------------------------------------------------------------------

export function useResponseTimings(
  message: UIMessage,
  isActiveStreaming: boolean | undefined,
  submitTime?: number,
): Timestamps | null {
  const tsRef = useRef<Timestamps>({
    submitted: 0,
    mounted: 0,
    searchStarted: 0,
    searchEnded: 0,
    textStarted: 0,
    completed: 0,
  });
  const wasStreamingRef = useRef(false);
  const [frozen, setFrozen] = useState<Timestamps | null>(null);

  // Record submit time + mount time when streaming begins
  useEffect(() => {
    if (isActiveStreaming && !wasStreamingRef.current) {
      wasStreamingRef.current = true;
      tsRef.current.submitted = submitTime || Date.now();
      tsRef.current.mounted = Date.now();
    }
  }, [isActiveStreaming, submitTime]);

  // Detect phase transitions from message parts
  useEffect(() => {
    if (!isActiveStreaming || !wasStreamingRef.current) return;

    const t = tsRef.current;
    const toolParts = message.parts.filter((p) => isToolUIPart(p));
    const hasSearch = toolParts.length > 0;
    const searchDone = toolParts.some(
      (p) => isToolUIPart(p) && p.state === "output-available",
    );

    if (hasSearch && !t.searchStarted) t.searchStarted = Date.now();
    if (searchDone && !t.searchEnded) t.searchEnded = Date.now();

    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => stripThink(p.text))
      .join("")
      .trim();
    if (text && !t.textStarted) t.textStarted = Date.now();
  }, [isActiveStreaming, message.parts]);

  // Freeze when streaming ends
  useEffect(() => {
    if (!isActiveStreaming && wasStreamingRef.current && !frozen) {
      tsRef.current.completed = Date.now();
      setFrozen({ ...tsRef.current });
    }
  }, [isActiveStreaming, frozen]);

  return frozen;
}

// ---------------------------------------------------------------------------
// Badge + HoverCard
// ---------------------------------------------------------------------------

export const ResponseTimingBadge = memo(function ResponseTimingBadge({
  timestamps,
}: {
  timestamps: Timestamps;
}) {
  const total = Math.round(
    (timestamps.completed - timestamps.submitted) / 1000,
  );
  if (total < 1) return null;

  const phases = buildPhases(timestamps);

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          className="cursor-default gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-normal text-foreground/70 hover:bg-secondary"
        >
          <ClockIcon className="size-3" />
          <span className="tabular-nums">{total}秒</span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-52">
        <div className="space-y-2">
          <p className="text-xs font-medium">処理時間の内訳</p>
          {phases.length > 0 ? (
            <>
              <div className="space-y-1">
                {phases.map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span>{p.label}</span>
                    <span className="tabular-nums">{p.seconds}秒</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>合計</span>
                  <span className="tabular-nums">{total}秒</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground tabular-nums">
              {total}秒
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
