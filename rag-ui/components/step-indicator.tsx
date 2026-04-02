"use client";

import { memo, useEffect, useRef, useState, type ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { CheckIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// StepIndicator — shows an active or completed processing step with elapsed time
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  icon: ComponentType<LucideProps>;
  activeLabel: string;
  completedLabel: string;
  active: boolean;
  tooltip?: string;
}

export const StepIndicator = memo(function StepIndicator({
  icon: Icon,
  activeLabel,
  completedLabel,
  active,
  tooltip,
}: StepIndicatorProps) {
  const startRef = useRef(Date.now());
  const frozenRef = useRef<number | null>(null);
  const wasActiveRef = useRef(active);
  const [, tick] = useState(0);

  // Freeze elapsed time when transitioning active → inactive
  if (wasActiveRef.current && !active && frozenRef.current === null) {
    frozenRef.current = Math.floor((Date.now() - startRef.current) / 1000);
  }
  wasActiveRef.current = active;

  // Tick every second while active
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const elapsed =
    frozenRef.current ?? Math.floor((Date.now() - startRef.current) / 1000);

  const indicator = (
    <div
      className={`inline-flex w-fit items-center gap-2.5 rounded-lg py-2 text-xs transition-all duration-300 ${
        active
          ? "px-3 border border-primary/30 bg-primary/10 text-foreground/70 animate-shimmer"
          : "pr-3 text-muted-foreground/60"
      }`}
      role="status"
      aria-live="polite"
    >
      {active ? (
        <Icon className="size-3.5 shrink-0 animate-soft-pulse text-primary/90" />
      ) : (
        <CheckIcon className="size-3.5 shrink-0 text-primary/60" />
      )}
      <span className="truncate max-w-xs">
        {active ? activeLabel : completedLabel}
      </span>
      {elapsed > 0 && (
        <span className="ml-auto tabular-nums text-[10px] opacity-50">
          {elapsed}秒
        </span>
      )}
    </div>
  );

  if (!tooltip) return indicator;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
