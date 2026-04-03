"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SLIDE_W, SLIDE_H } from "./constants";
import { slideSrcDoc, thumbSrcDoc } from "./utils";
import type { GeneratedSlide } from "./types";

interface PhaseViewerProps {
  activeSlide: GeneratedSlide;
  activeIndex: number;
  generatedSlides: GeneratedSlide[];
  scale: number;
  editing: boolean;
  error: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  mainAreaRef: React.RefObject<HTMLDivElement | null>;
  slideContainerRef: React.RefObject<HTMLDivElement | null>;
  onSlideChange: (index: number) => void;
  onClearError: () => void;
}

export function PhaseViewer({
  activeSlide,
  activeIndex,
  generatedSlides,
  scale,
  editing,
  error,
  iframeRef,
  mainAreaRef,
  slideContainerRef,
  onSlideChange,
  onClearError,
}: PhaseViewerProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Error banner (partial failure) */}
      {error && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={onClearError}
            className="shrink-0 p-0.5 hover:bg-amber-500/10 rounded"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      {/* Main slide view */}
      <div
        ref={mainAreaRef}
        className="flex flex-1 items-center justify-center overflow-hidden bg-muted/20 p-4"
      >
        <div
          ref={slideContainerRef}
          className="relative rounded-md shadow-lg overflow-hidden"
          style={{
            width: SLIDE_W * scale,
            height: SLIDE_H * scale,
          }}
        >
          <iframe
            ref={iframeRef}
            key={`slide-${activeIndex}-${activeSlide.html.length}`}
            srcDoc={slideSrcDoc(activeSlide.html, activeIndex + 1, generatedSlides.length)}
            className={editing ? "" : "pointer-events-none"}
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              border: "none",
            }}
            tabIndex={-1}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-3 border-t border-border px-3 py-2">
        <button
          onClick={() => onSlideChange(Math.max(activeIndex - 1, 0))}
          disabled={activeIndex === 0}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {activeIndex + 1} / {generatedSlides.length}
        </span>
        <button
          onClick={() =>
            onSlideChange(
              Math.min(activeIndex + 1, generatedSlides.length - 1),
            )
          }
          disabled={activeIndex === generatedSlides.length - 1}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* Thumbnail strip */}
      <div className="border-t border-border px-2 py-2 overflow-x-auto">
        <div className="flex gap-1.5">
          {generatedSlides.map((slide, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={cn(
                "relative shrink-0 rounded border overflow-hidden transition-all",
                i === activeIndex
                  ? "border-primary ring-1 ring-primary/30"
                  : slide.failed
                    ? "border-amber-500/50"
                    : "border-border/60 hover:border-foreground/30",
              )}
              style={{ width: 96, height: 54 }}
            >
              <iframe
                srcDoc={thumbSrcDoc(slide.html)}
                className="pointer-events-none"
                style={{
                  width: SLIDE_W,
                  height: SLIDE_H,
                  transform: `scale(${96 / SLIDE_W})`,
                  transformOrigin: "top left",
                }}
                tabIndex={-1}
                loading="lazy"
              />
              {slide.failed && (
                <div className="absolute top-0.5 right-0.5">
                  <AlertTriangleIcon className="size-2.5 text-amber-500" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
