"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  XIcon,
  PresentationIcon,
  DownloadIcon,
} from "lucide-react";
import html2canvas from "html2canvas";
import { useSlideStore } from "@/lib/slide-store";
import { useChatSettingsStore } from "@/lib/store";
import { calcMaxSlides } from "@/lib/slide-prompts";

// ---------------------------------------------------------------------------
// Shared CDN head for slide iframes
// ---------------------------------------------------------------------------

const SLIDE_CDN_HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com/4"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<style>body { font-family: 'Noto Sans JP', 'Inter', sans-serif; margin: 0; }</style>`;

function slideSrcDoc(html: string, bg = "#18181b") {
  return `<!DOCTYPE html>
<html><head>${SLIDE_CDN_HEAD}</head>
<body style="background:${bg};display:flex;align-items:center;justify-content:center;min-height:100vh;">
${html}
<script>lucide.createIcons();</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Pipeline: Plan → Render each slide sequentially
// ---------------------------------------------------------------------------

function useSlidePipeline() {
  const {
    open,
    phase,
    question,
    answer,
    slides,
    setPhase,
    setPlan,
    setRenderedSlide,
    setRenderingIndex,
    setError,
  } = useSlideStore();

  const abortRef = useRef<AbortController | null>(null);

  // Step 1: Generate plan when opened
  useEffect(() => {
    if (!open || phase !== "planning") return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch("/api/slides/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, answer, maxSlides: calcMaxSlides(answer) }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Plan API error: ${res.status}`);

        const data = await res.json();
        setPlan(data.planMd, data.deckTitle, data.slides);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[slide-viewer] Plan error:", err);
        setError((err as Error).message);
      }
    })();

    return () => controller.abort();
  }, [open, phase, question, answer, setPlan, setError]);

  // Step 2: Render slides sequentially when plan is ready.
  // We watch `phase` and `slides` but gate with a ref so that the async work
  // runs only once per plan_ready transition.  The abort controller is stored
  // in abortRef (shared with step-1) so closing the viewer can cancel it.
  const renderTriggeredRef = useRef(false);

  useEffect(() => {
    if (phase !== "plan_ready" || slides.length === 0 || renderTriggeredRef.current) return;

    renderTriggeredRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("rendering");

    (async () => {
      try {
        for (let i = 0; i < slides.length; i++) {
          if (controller.signal.aborted) return;
          setRenderingIndex(i);

          const slide = slides[i];
          const res = await fetch("/api/slides/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slidePlanSection: slide.planText,
              slideTitle: slide.title,
              slideIndex: i,
              totalSlides: slides.length,
              deckTitle: useSlideStore.getState().deckTitle,
              slideType: slide.type,
            }),
            signal: controller.signal,
          });

          if (!res.ok) throw new Error(`Render API error: ${res.status}`);

          const data = await res.json();
          setRenderedSlide(i, data.html);
        }
        setPhase("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[slide-viewer] Render error:", err);
        setError((err as Error).message);
      }
    })();

    // NOTE: no cleanup here — we do NOT want phase changes (rendering → done)
    // to abort the in-flight fetch.  Abort is handled by the close-effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, slides]);

  // Reset the render gate & abort on close
  useEffect(() => {
    if (!open) {
      renderTriggeredRef.current = false;
      abortRef.current?.abort();
    }
  }, [open]);
}

// ---------------------------------------------------------------------------
// Regenerate a single slide
// ---------------------------------------------------------------------------

function useRegenerateSlide() {
  const { slides, deckTitle, setRenderedSlide } = useSlideStore();

  return useCallback(
    async (index: number) => {
      const slide = slides[index];
      if (!slide) return;

      // Clear current HTML to show loading
      setRenderedSlide(index, "");

      try {
        const res = await fetch("/api/slides/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slidePlanSection: slide.planText,
            slideTitle: slide.title,
            slideIndex: index,
            totalSlides: slides.length,
            deckTitle,
            slideType: slide.type,
          }),
        });

        if (!res.ok) throw new Error(`Render API error: ${res.status}`);
        const data = await res.json();
        setRenderedSlide(index, data.html);
      } catch (err) {
        console.error(`[slide-viewer] Regenerate error for slide ${index}:`, err);
      }
    },
    [slides, deckTitle, setRenderedSlide],
  );
}

// ---------------------------------------------------------------------------
// Export slides as PPTX (screenshot-based)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Clone iframe DOM with computed styles inlined (for reliable html2canvas)
// ---------------------------------------------------------------------------

function cloneWithInlinedStyles(iframe: HTMLIFrameElement): HTMLDivElement {
  const iframeDoc = iframe.contentDocument!;
  const iframeWin = iframe.contentWindow!;
  const sourceBody = iframeDoc.body;

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";

  // Copy body background
  const bodyComputed = iframeWin.getComputedStyle(sourceBody);
  wrapper.style.background = bodyComputed.background;
  wrapper.style.fontFamily = bodyComputed.fontFamily;
  wrapper.innerHTML = sourceBody.innerHTML;

  document.body.appendChild(wrapper);

  // Inline computed styles for every element
  const sourceEls = sourceBody.querySelectorAll("*");
  const cloneEls = wrapper.querySelectorAll("*");

  for (let j = 0; j < sourceEls.length; j++) {
    const computed = iframeWin.getComputedStyle(sourceEls[j]);
    const el = cloneEls[j] as HTMLElement;
    if (!el?.style) continue;
    // Copy key visual properties (full cssText is too large and slow)
    const props = [
      "display",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "width",
      "height",
      "min-width",
      "min-height",
      "max-width",
      "max-height",
      "margin",
      "padding",
      "border",
      "border-radius",
      "background",
      "background-color",
      "background-image",
      "color",
      "font-size",
      "font-weight",
      "font-family",
      "line-height",
      "text-align",
      "text-decoration",
      "text-transform",
      "letter-spacing",
      "flex-direction",
      "flex-wrap",
      "flex-grow",
      "flex-shrink",
      "flex-basis",
      "align-items",
      "justify-content",
      "gap",
      "grid-template-columns",
      "grid-template-rows",
      "grid-column",
      "grid-row",
      "overflow",
      "opacity",
      "z-index",
      "box-shadow",
      "transform",
      "transform-origin",
      "white-space",
      "word-break",
      "vertical-align",
    ];
    for (const prop of props) {
      const val = computed.getPropertyValue(prop);
      if (val) el.style.setProperty(prop, val);
    }
  }

  return wrapper;
}

function useExportPptx() {
  const { slides, renderedHtml, deckTitle, question, answer, setExporting } = useSlideStore();

  async function downloadPptx(payload: object, filenameBase: string) {
    const res = await fetch("/api/slides/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`PPTX API error: ${res.status} ${errText}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase || "slides"}.pptx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return useCallback(async () => {
    const totalRendered = Object.keys(renderedHtml).length;
    const canStructuredExport = question.trim().length > 0 && answer.trim().length > 0;
    if (!canStructuredExport && totalRendered === 0) return;

    setExporting(true);
    try {
      // Try structured deck export first (editable PPTX with real text/charts/tables).
      if (canStructuredExport) {
        try {
          const generateRes = await fetch("/api/slides/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              answer,
              max_slides: calcMaxSlides(answer),
            }),
          });

          if (generateRes.ok) {
            const data = await generateRes.json();
            if (data?.deck?.slides?.length > 0) {
              const safeTitle = (data.deck.title as string) || deckTitle || question || "slides";
              await downloadPptx(
                {
                  title: safeTitle,
                  deck: data.deck,
                },
                safeTitle,
              );
              return;
            }
          } else {
            const errText = await generateRes.text().catch(() => "");
            console.warn(
              `[pptx] Structured export generation failed (${generateRes.status}):`,
              errText,
            );
          }
        } catch (structuredErr) {
          console.warn(
            "[pptx] Structured export unavailable, fallback to screenshot:",
            structuredErr,
          );
        }
      }

      // Fallback: screenshot-based export.
      const images: string[] = [];

      for (let i = 0; i < slides.length; i++) {
        const html = renderedHtml[i];
        if (!html) continue;

        // Create hidden iframe to render slide with Tailwind CDN
        const container = document.createElement("div");
        container.style.cssText =
          "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        const fullHtml = `<!DOCTYPE html>
<html><head>${SLIDE_CDN_HEAD}</head>
<body style="margin:0;padding:0;width:1280px;height:720px;overflow:hidden;">
${html}
<script>lucide.createIcons();</script>
</body></html>`;

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "width:1280px;height:720px;border:none;";
        container.appendChild(iframe);

        await new Promise<void>((resolve) => {
          iframe.onload = () => resolve();
          iframe.srcdoc = fullHtml;
        });

        // Wait for Tailwind CDN + fonts + icons to process
        await new Promise((r) => setTimeout(r, 3000));

        try {
          // Clone iframe content with inlined computed styles → regular div
          const captureDiv = cloneWithInlinedStyles(iframe);

          const canvas = await html2canvas(captureDiv, {
            width: 1280,
            height: 720,
            scale: 1,
            useCORS: true,
            logging: false,
          });
          images.push(canvas.toDataURL("image/jpeg", 0.85));

          document.body.removeChild(captureDiv);
        } catch (screenshotErr) {
          console.warn(`[pptx] Screenshot failed for slide ${i}, using fallback`, screenshotErr);
          const fallbackCanvas = document.createElement("canvas");
          fallbackCanvas.width = 1280;
          fallbackCanvas.height = 720;
          const ctx = fallbackCanvas.getContext("2d")!;
          ctx.fillStyle = "#18181b";
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 36px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(slides[i]?.title || `Slide ${i + 1}`, 640, 360);
          images.push(fallbackCanvas.toDataURL("image/jpeg", 0.85));
        }

        document.body.removeChild(container);
      }

      if (images.length === 0) return;
      await downloadPptx({ pngs: images, title: deckTitle }, deckTitle || "slides");
    } catch (err) {
      console.error("[pptx] Export error:", err);
      alert(`PPTX出力に失敗しました: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [slides, renderedHtml, deckTitle, question, answer, setExporting]);
}

// ---------------------------------------------------------------------------
// Slide Thumbnail
// ---------------------------------------------------------------------------

function SlideThumbnail({
  index,
  html,
  isActive,
  isRendering,
  onClick,
}: {
  index: number;
  html: string | undefined;
  isActive: boolean;
  isRendering: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-video rounded-md border-2 overflow-hidden transition-colors ${
        isActive
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-zinc-700 hover:border-zinc-500"
      }`}
    >
      {html ? (
        <iframe
          srcDoc={slideSrcDoc(html, "white")}
          className="origin-top-left pointer-events-none"
          style={{
            width: 1280,
            height: 720,
            transform: "scale(0.14)",
            transformOrigin: "top left",
            border: "none",
          }}
          sandbox="allow-same-origin allow-scripts"
          tabIndex={-1}
          title={`Slide ${index + 1} thumbnail`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-content bg-zinc-800">
          {isRendering ? (
            <Spinner className="size-4 mx-auto" />
          ) : (
            <span className="text-[10px] text-zinc-500 mx-auto">{index + 1}</span>
          )}
        </div>
      )}
      <span className="absolute bottom-0.5 right-1 text-[9px] text-zinc-400 bg-black/50 px-1 rounded">
        {index + 1}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Preview (iframe with srcdoc for style isolation)
// ---------------------------------------------------------------------------

function SlidePreview({ html }: { html: string | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      // Slide is 1280x720; fit to container width
      setScale(Math.min(width / 1280, 1));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!html) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-zinc-900 rounded-lg">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden"
      style={{ height: 720 * scale }}
    >
      <iframe
        srcDoc={slideSrcDoc(html)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1280,
          height: 720,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
        }}
        className="rounded-lg"
        sandbox="allow-same-origin allow-scripts"
        title="Slide Preview"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Progress Bar
// ---------------------------------------------------------------------------

function PhaseProgress() {
  const phase = useSlideStore((s) => s.phase);
  const slides = useSlideStore((s) => s.slides);
  const renderingIndex = useSlideStore((s) => s.renderingIndex);
  const renderedCount = Object.keys(useSlideStore((s) => s.renderedHtml)).length;

  if (phase === "done") return null;

  const labels: Record<string, string> = {
    planning: "大纲を生成中...",
    plan_ready: "レンダリング準備中...",
    rendering: `スライド ${renderingIndex + 1}/${slides.length} をレンダリング中...`,
    error: "エラーが発生しました",
  };

  const progress =
    phase === "rendering" && slides.length > 0
      ? (renderedCount / slides.length) * 100
      : phase === "planning"
        ? 0
        : 100;

  return (
    <div className="px-4 py-2 border-t border-zinc-800">
      <div className="flex items-center gap-3">
        {phase !== "error" && <Spinner className="size-3.5" />}
        <span className="text-xs text-zinc-400">{labels[phase] || phase}</span>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideViewer (exported)
// ---------------------------------------------------------------------------

export function SlideViewer() {
  const {
    open,
    close,
    phase,
    slides,
    renderedHtml,
    currentSlide,
    setCurrentSlide,
    error,
    reset,
    exporting,
  } = useSlideStore();

  useSlidePipeline();
  const regenerateSlide = useRegenerateSlide();
  const exportPptx = useExportPptx();

  const handlePrev = useCallback(() => {
    setCurrentSlide(Math.max(0, currentSlide - 1));
  }, [currentSlide, setCurrentSlide]);

  const handleNext = useCallback(() => {
    setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1));
  }, [currentSlide, slides.length, setCurrentSlide]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handlePrev, handleNext, close]);

  const handleClose = useCallback(() => {
    close();
    // Reset immediately — the Dialog unmounts content when open=false,
    // so there is no animation race with the next open.
    reset();
  }, [close, reset]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 bg-zinc-900 border-zinc-700 flex flex-col overflow-hidden"
      >
        <DialogTitle className="sr-only">スライドビューア</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <PresentationIcon className="size-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-200">スライドビューア</span>
            {slides.length > 0 && (
              <Badge variant="secondary" className="text-[11px] rounded-full">
                {currentSlide + 1} / {slides.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {phase === "done" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={exportPptx}
                disabled={exporting}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                <DownloadIcon className="size-3.5 mr-1" />
                {exporting ? "出力中..." : "PPTX"}
              </Button>
            )}
            {renderedHtml[currentSlide] && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => regenerateSlide(currentSlide)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCwIcon className="size-3.5 mr-1" />
                再生成
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="size-8 text-zinc-400 hover:text-zinc-200"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Thumbnail sidebar */}
          <div className="w-36 shrink-0 border-r border-zinc-800 overflow-y-auto p-2 space-y-2">
            {slides.map((slide, i) => (
              <SlideThumbnail
                key={i}
                index={i}
                html={renderedHtml[i]}
                isActive={i === currentSlide}
                isRendering={phase === "rendering" && useSlideStore.getState().renderingIndex === i}
                onClick={() => setCurrentSlide(i)}
              />
            ))}
            {slides.length === 0 && phase === "planning" && (
              <div className="flex flex-col items-center gap-2 py-8">
                <Spinner className="size-5" />
                <span className="text-[10px] text-zinc-500">生成中...</span>
              </div>
            )}
          </div>

          {/* Main preview */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              {error ? (
                <div className="text-center text-red-400">
                  <p className="text-sm">エラー: {error}</p>
                  <Button variant="outline" size="sm" onClick={handleClose} className="mt-4">
                    閉じる
                  </Button>
                </div>
              ) : (
                <div className="w-full max-w-5xl" style={{ aspectRatio: "16/9" }}>
                  <SlidePreview html={renderedHtml[currentSlide]} />
                </div>
              )}
            </div>

            {/* Navigation */}
            {slides.length > 1 && (
              <div className="flex items-center justify-center gap-4 py-2 border-t border-zinc-800 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrev}
                  disabled={currentSlide === 0}
                  className="size-8"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <span className="text-xs text-zinc-400 min-w-[60px] text-center">
                  {currentSlide + 1} / {slides.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  disabled={currentSlide >= slides.length - 1}
                  className="size-8"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Phase progress */}
        {phase !== "idle" && phase !== "done" && <PhaseProgress />}
      </DialogContent>
    </Dialog>
  );
}
