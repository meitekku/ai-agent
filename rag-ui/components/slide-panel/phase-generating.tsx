"use client";

import { Loader2Icon, AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SLIDE_W, SLIDE_H } from "./constants";
import { thumbSrcDoc } from "./utils";
import type { SlideSection, GeneratedSlide } from "./types";

interface PhaseGeneratingProps {
  slides: GeneratedSlide[];
  sections: SlideSection[];
  total: number;
  completed: number;
}

export function PhaseGenerating({
  slides,
  sections,
  total,
  completed,
}: PhaseGeneratingProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin text-primary" />
          <span className="text-muted-foreground">
            スライド生成中{" "}
            <span className="font-medium text-foreground">
              {completed}/{total}
            </span>
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${total ? (completed / total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {sections.map((section, i) => {
            const slide = slides[i];
            return (
              <div
                key={i}
                className={cn(
                  "relative aspect-video rounded-md border overflow-hidden bg-muted/30",
                  slide?.failed
                    ? "border-amber-500/40"
                    : "border-border/60",
                )}
                style={{ containerType: "inline-size" }}
              >
                {slide?.html ? (
                  <>
                    <iframe
                      srcDoc={thumbSrcDoc(slide.html)}
                      className="pointer-events-none absolute top-0 left-0 origin-top-left"
                      style={{
                        width: SLIDE_W,
                        height: SLIDE_H,
                        transform: `scale(${1 / SLIDE_W})`,
                        transformOrigin: "top left",
                        /* scale will be overridden by ResizeObserver below */
                      }}
                      tabIndex={-1}
                      ref={(el) => {
                        if (!el?.parentElement) return;
                        const s = el.parentElement.clientWidth / SLIDE_W;
                        el.style.transform = `scale(${s})`;
                      }}
                    />
                    {slide.failed && (
                      <div className="absolute top-1 right-1">
                        <AlertTriangleIcon className="size-3.5 text-amber-500" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
                    {i === slides.filter((s) => s).length ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : null}
                    <span className="text-[10px]">{section.title}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
