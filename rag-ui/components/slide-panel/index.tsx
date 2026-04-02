"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSlidePanelStore } from "@/lib/slide-panel-store";
import {
  saveSlideDeck,
  updateSlideDeck,
  fetchSlideDeckDetail,
  fetchSlidesAtVersion,
  restoreSlideVersion,
} from "@/lib/slide-api";
import { FullscreenPresenter } from "@/components/fullscreen-presenter";
import {
  XIcon,
  Loader2Icon,
  PlayIcon,
  SaveIcon,
  DownloadIcon,
  CheckIcon,
  Edit3Icon,
  RefreshCwIcon,
  FileDownIcon,
  SquareIcon,
  RotateCcwIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import { SLIDE_W, SLIDE_H, PLAN_TIMEOUT_MS, RENDER_TIMEOUT_MS, FONT_PRESETS } from "./constants";
import type { SlideSection, GeneratedSlide, Phase } from "./types";
import {
  slideSrcDoc,
  failedSlideHtml,
  parsePlanMd,
  fetchWithRetry,
  setupDragHandles,
  cleanupDragHandles,
  applyDragTranslate,
} from "./utils";
import { PhasePlanning } from "./phase-planning";
import { PhaseGenerating } from "./phase-generating";
import { PhaseViewer } from "./phase-viewer";
import { PhaseError } from "./phase-error";

export function SlidePanel() {
  const {
    open,
    question,
    answer,
    instructions,
    styleOptions,
    deckId,
    closePanel,
    cachedSlides: storeCachedSlides,
    cachedDeckTitle: storeCachedTitle,
    conversationDeckId,
    refreshToken,
    setCachedSlides: storeSetCachedSlides,
    setConversationDeckId,
  } = useSlidePanelStore();

  // Phase state
  const [phase, setPhase] = useState<Phase>("planning");
  const [error, setError] = useState<string | null>(null);

  // Plan
  const [planMd, setPlanMd] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [slideSections, setSlideSections] = useState<SlideSection[]>([]);

  // Generation
  const [generatedSlides, setGeneratedSlides] = useState<GeneratedSlide[]>([]);
  const [generatingTotal, setGeneratingTotal] = useState(0);
  const [generatingCompleted, setGeneratingCompleted] = useState(0);

  // Viewer
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);

  // DB save
  const [currentDeckId, setCurrentDeckId] = useState<number | null>(deckId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Fullscreen presentation
  const [fullscreen, setFullscreen] = useState(false);

  // Expanded (fullscreen editing) mode
  const [expanded, setExpanded] = useState(false);

  // Resizable panel width
  const [panelWidth, setPanelWidth] = useState(560);
  const panelResizingRef = useRef(false);
  const panelResizeStartXRef = useRef(0);
  const panelResizeStartWRef = useRef(560);

  // Redraw
  const [redrawing, setRedrawing] = useState(false);

  // Version history
  const [currentVersion, setCurrentVersion] = useState(1);
  const [maxVersion, setMaxVersion] = useState(1);
  const [browsingVersion, setBrowsingVersion] = useState<number | null>(null);
  const [versionSlides, setVersionSlides] = useState<GeneratedSlide[] | null>(null);
  const [restoringVersion, setRestoringVersion] = useState(false);

  // Refs
  const abortRef = useRef<AbortController | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editFontRef = useRef("Noto Sans JP, Hiragino Sans, sans-serif");
  const lastFocusedEditableRef = useRef<HTMLElement | null>(null);
  const scaleRef = useRef(0.5);
  const [scale, setScale] = useState(0.5);
  const initiatedRef = useRef(false);
  // Track previous question/answer to detect re-open vs new generation
  const prevDataRef = useRef({ question: "", answer: "" });

  const failedCount = generatedSlides.filter((s) => s?.failed).length;

  // ============================================================
  // Scale calculation
  // ============================================================

  const updateScale = useCallback(() => {
    const el = mainAreaRef.current;
    if (!el) return;
    const padding = expanded ? 80 : 48;
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    const s = Math.max(0.1, Math.min(availW / SLIDE_W, availH / SLIDE_H, 1));
    scaleRef.current = s;
    setScale(s);
  }, [expanded]);

  useEffect(() => {
    if (phase !== "done") return;
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [phase, updateScale, panelWidth, expanded]);

  // ============================================================
  // Cancel handler
  // ============================================================

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // If we have partial results, show them
    if (generatedSlides.length > 0) {
      setPhase("done");
      setActiveIndex(0);
    } else {
      closePanel();
    }
  }, [generatedSlides.length, closePanel]);

  // ============================================================
  // Init: load deck from DB or start plan generation
  // ============================================================

  useEffect(() => {
    if (!open || initiatedRef.current) return;

    // Check if data changed (new generation request)
    const dataChanged =
      prevDataRef.current.question !== question ||
      prevDataRef.current.answer !== answer;
    if (dataChanged && (question || answer)) {
      // Reset for new generation
      setPhase("planning");
      setPlanMd("");
      setDeckTitle("");
      setSlideSections([]);
      setGeneratedSlides([]);
      setGeneratingTotal(0);
      setGeneratingCompleted(0);
      setActiveIndex(0);
      setError(null);
      setCurrentDeckId(null);
      setSaving(false);
      setSaved(false);
      setRedrawing(false);
      prevDataRef.current = { question, answer };
    }

    initiatedRef.current = true;

    // Priority 1: explicit deckId
    if (deckId) {
      loadDeckFromDb(deckId);
    }
    // Priority 2: cached slides in store (instant reopen)
    else if (storeCachedSlides && storeCachedSlides.length > 0 && conversationDeckId) {
      setDeckTitle(storeCachedTitle || "");
      setCurrentDeckId(conversationDeckId);
      setGeneratedSlides(storeCachedSlides.map((s) => ({ ...s, failed: false })));
      setPhase("done");
      setActiveIndex(0);
      setSaved(true);
    }
    // Priority 3: new generation from question/answer
    else if (question && answer) {
      prevDataRef.current = { question, answer };
      fetchPlanFromApi();
    }
  }, [open, deckId, question, answer]);

  const loadDeckFromDb = (id: number) => {
    setPhase("loading");
    fetchSlideDeckDetail(id)
      .then((detail) => {
        setDeckTitle(detail.title);
        setCurrentDeckId(detail.id);
        if (detail.plan_md) {
          setPlanMd(detail.plan_md);
          const parsed = parsePlanMd(detail.plan_md);
          setSlideSections(parsed.slides);
        }
        const slides = detail.slides.map((s) => ({
          index: s.slide_index,
          title: s.title,
          html: s.html,
          type: s.slide_type,
        }));
        setGeneratedSlides(slides);
        setPhase("done");
        setActiveIndex(0);
        // Set version info
        const ver = detail.current_version ?? 1;
        setCurrentVersion(ver);
        setMaxVersion(ver);
        setBrowsingVersion(null);
        setVersionSlides(null);
        // Cache in store for instant reopen
        storeSetCachedSlides(slides, detail.title);
        setConversationDeckId(detail.id);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load deck");
        setPhase("error");
      });
  };

  // Handle open/close transitions — support re-open with cached data
  useEffect(() => {
    if (open) {
      // Check if this is a re-open with same data (cached slides available)
      const sameData =
        prevDataRef.current.question === question &&
        prevDataRef.current.answer === answer;
      if (sameData && generatedSlides.length > 0 && !initiatedRef.current) {
        // Re-open: skip fetch, go straight to done
        initiatedRef.current = true;
        setPhase("done");
        setEditing(false);
        setExpanded(false);
        return;
      }
    } else {
      // Closing: keep data for potential re-open, just clean up editing state
      setEditing(false);
      setExpanded(false);
      setExporting(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      // Allow re-initiation on next open
      initiatedRef.current = false;
    }
  }, [open, question, answer, generatedSlides.length]);

  // ============================================================
  // Phase 1: Plan (with retry + timeout)
  // ============================================================

  const fetchPlanFromApi = useCallback(async () => {
    setPhase("planning");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithRetry(
        "/api/slides/htmlslide/plan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            answer,
            instructions,
            styleOptions,
          }),
          signal: controller.signal,
        },
        PLAN_TIMEOUT_MS,
      );

      if (!res.ok) {
        const text = await res.text();
        let detail = `HTTP ${res.status}`;
        try {
          detail = JSON.parse(text).detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const data = await res.json();
      const md = data.planMd || data.plan_md || "";
      setPlanMd(md);

      const parsed = parsePlanMd(md);
      setDeckTitle(parsed.title);
      setSlideSections(parsed.slides);
      setPhase("plan_ready");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to generate plan");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [question, answer]);

  // ============================================================
  // Phase 2: Render slides (per-slide error tolerance + retry)
  // ============================================================

  const renderSlides = useCallback(
    async (
      sections: SlideSection[],
      title: string,
      existingSlides?: GeneratedSlide[],
      renderStyleOptions?: import("@/lib/slide-types").StyleOptions | null,
    ) => {
      if (sections.length === 0) return;

      setPhase("generating");
      setError(null);

      // Initialize slides array: reuse existing successful slides, fill rest with placeholders
      const slides: GeneratedSlide[] = sections.map((section, i) => {
        if (existingSlides?.[i] && !existingSlides[i].failed) {
          return existingSlides[i];
        }
        return { index: i, title: section.title, html: "", type: section.type };
      });
      setGeneratedSlides([...slides]);
      setGeneratingTotal(sections.length);

      const controller = new AbortController();
      abortRef.current = controller;

      // Indices that need (re-)generation
      const pending = sections
        .map((_, i) => i)
        .filter((i) => !existingSlides?.[i] || existingSlides[i].failed);
      let doneCount = sections.length - pending.length;
      let newFailCount = 0;
      setGeneratingCompleted(doneCount);

      try {
        // Worker pool: N workers share a cursor into the pending list
        const CONCURRENCY = 3;
        let cursor = 0;

        async function worker() {
          while (cursor < pending.length) {
            if (controller.signal.aborted) return;
            const idx = pending[cursor++]; // grab next index atomically (single-threaded JS)
            const section = sections[idx];

            try {
              const res = await fetchWithRetry(
                "/api/slides/htmlslide/render",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    slide_plan_section: section.plan_text,
                    slide_title: section.title,
                    slide_index: idx,
                    total_slides: sections.length,
                    deck_title: title,
                    slide_type: section.type,
                    style_options: renderStyleOptions || undefined,
                  }),
                  signal: controller.signal,
                },
                RENDER_TIMEOUT_MS,
              );

              if (!res.ok) {
                const text = await res.text();
                let detail = `HTTP ${res.status}`;
                try { detail = JSON.parse(text).detail || detail; } catch { /* */ }
                throw new Error(detail);
              }

              const data = await res.json();
              slides[idx] = {
                index: idx,
                title: section.title,
                html: data.html || "",
                type: section.type,
              };
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") return;
              const errMsg = e instanceof Error ? e.message : "Generation failed";
              console.error(`[slide-panel] Slide ${idx + 1} failed:`, errMsg);
              slides[idx] = {
                index: idx,
                title: section.title,
                html: failedSlideHtml(section.title, errMsg),
                type: section.type,
                failed: true,
              };
              newFailCount++;
            }

            doneCount++;
            setGeneratedSlides([...slides]);
            setGeneratingCompleted(doneCount);
          }
        }

        // Spawn workers and wait for all to finish
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
        );

        setPhase("done");
        setActiveIndex(0);

        // Auto-save (only successful slides)
        const successSlides = slides.filter((s) => !s.failed);
        if (successSlides.length > 0) {
          autoSave(slides);
        }

        if (newFailCount > 0) {
          setError(
            `${newFailCount}枚のスライド生成に失敗しました。再試行できます。`,
          );
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;

        // If we have any slides, show partial results
        if (slides.some((s) => s && !s.failed)) {
          setPhase("done");
          setActiveIndex(0);
          setError(e instanceof Error ? e.message : "Generation failed");
        } else {
          setError(e instanceof Error ? e.message : "Generation failed");
          setPhase("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const startGeneration = useCallback(() => {
    setGeneratedSlides([]);
    renderSlides(slideSections, deckTitle, undefined, styleOptions);
  }, [slideSections, deckTitle, styleOptions, renderSlides]);

  // Retry only failed slides
  const retryFailed = useCallback(() => {
    renderSlides(slideSections, deckTitle, generatedSlides, styleOptions);
  }, [slideSections, deckTitle, generatedSlides, styleOptions, renderSlides]);

  // ============================================================
  // Auto-save after generation
  // ============================================================

  const autoSave = useCallback(
    async (slides: GeneratedSlide[]) => {
      try {
        const slidesData = slides
          .filter((s) => !s.failed)
          .map((s, i) => ({
            slide_index: i,
            title: s.title,
            slide_type: s.type,
            html: s.html,
            plan_text: slideSections[s.index]?.plan_text,
          }));

        if (slidesData.length === 0) return;

        // Get conversation ID from URL
        const pathMatch = window.location.pathname.match(/\/chat\/(.+)/);
        const conversationId = pathMatch?.[1] || undefined;

        const result = await saveSlideDeck({
          title: deckTitle || question,
          question,
          answer,
          plan_md: planMd || undefined,
          conversation_id: conversationId,
          slides: slidesData,
        });
        setCurrentDeckId(result.id);
        setSaved(true);
        setCurrentVersion(1);
        setMaxVersion(1);

        // Cache in store for instant reopen
        const cached = slides
          .filter((s) => !s.failed)
          .map((s) => ({ index: s.index, title: s.title, html: s.html, type: s.type }));
        storeSetCachedSlides(cached, deckTitle || question);
        setConversationDeckId(result.id);
      } catch {
        // Auto-save failure is non-critical
      }
    },
    [deckTitle, question, answer, planMd, slideSections, storeSetCachedSlides, setConversationDeckId],
  );

  // ============================================================
  // Manual save
  // ============================================================

  const handleSave = useCallback(async () => {
    if (generatedSlides.length === 0) return;
    setSaving(true);

    try {
      const slidesData = generatedSlides
        .filter((s) => !s.failed)
        .map((s, i) => ({
          slide_index: i,
          title: s.title,
          slide_type: s.type,
          html: s.html,
          plan_text: slideSections[s.index]?.plan_text,
        }));

      if (currentDeckId) {
        await updateSlideDeck(currentDeckId, { slides: slidesData });
      } else {
        const result = await saveSlideDeck({
          title: deckTitle || question,
          question,
          answer,
          plan_md: planMd || undefined,
          slides: slidesData,
        });
        setCurrentDeckId(result.id);
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    generatedSlides,
    currentDeckId,
    deckTitle,
    question,
    answer,
    planMd,
    slideSections,
  ]);

  // ============================================================
  // PPTX Export
  // ============================================================

  /** Render a slide iframe to PNG data URL via html2canvas.
   *  Captures directly inside the iframe where Tailwind CSS is already processed,
   *  so all styles are faithfully reproduced (no computed-style copying needed). */
  const captureSlideAsPng = useCallback(async (
    html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>,
    slideHtml: string,
    slideTitle: string,
  ): Promise<string> => {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
    document.body.appendChild(container);

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:1280px;height:720px;border:none;";
    container.appendChild(iframe);
    iframe.srcdoc = slideSrcDoc(slideHtml);

    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });
    // Wait for fonts to fully load inside iframe
    try {
      await iframe.contentDocument!.fonts.ready;
    } catch { /* fonts API not available */ }
    // Additional wait for Tailwind CSS processing + Lucide icons rendering
    await new Promise((r) => setTimeout(r, 1500));

    let png: string;
    try {
      const iframeBody = iframe.contentDocument!.body;

      // Capture directly inside the iframe — Tailwind styles are fully resolved here
      const canvas = await html2canvas(iframeBody, {
        width: 1280,
        height: 720,
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        // html2canvas uses the element's ownerDocument, which is the iframe document
        // where Tailwind CSS has already been applied
      });
      png = canvas.toDataURL("image/png");
    } catch {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(slideTitle || "Slide", 640, 360);
      png = canvas.toDataURL("image/png");
    }
    document.body.removeChild(container);
    return png;
  }, []);

  const handleExport = useCallback(async () => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;
    setExporting(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const pngs: string[] = [];

      for (let i = 0; i < validSlides.length; i++) {
        const png = await captureSlideAsPng(html2canvas, validSlides[i].html, validSlides[i].title);
        pngs.push(png);
      }

      const res = await fetch("/api/slides/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: deckTitle || "slides", pngs }),
      });
      if (!res.ok) throw new Error(`PPTX export failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(deckTitle || "slides").replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g, "_")}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [generatedSlides, deckTitle]);

  // ============================================================
  // PDF Export
  // ============================================================

  const handlePdfExport = useCallback(async () => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;
    setExportingPdf(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const SLIDE_W_MM = 338.67;
      const SLIDE_H_MM = 190.5;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [SLIDE_W_MM, SLIDE_H_MM],
      });

      for (let i = 0; i < validSlides.length; i++) {
        const png = await captureSlideAsPng(html2canvas, validSlides[i].html, validSlides[i].title);
        if (i > 0) doc.addPage([SLIDE_W_MM, SLIDE_H_MM], "landscape");
        const base64 = png.includes(",") ? png.split(",")[1] : png;
        doc.addImage(base64, "PNG", 0, 0, SLIDE_W_MM, SLIDE_H_MM);
      }

      const safeName = (deckTitle || "slides").replace(
        /[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g,
        "_",
      );
      doc.save(`${safeName}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  }, [generatedSlides, deckTitle, captureSlideAsPng]);

  // ============================================================
  // Editing: full drag/resize/font system (operates on iframe contentDocument)
  // ============================================================

  useEffect(() => {
    if (!editing || phase !== "done") return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const initEditing = () => {
      const iframeDoc = iframe.contentDocument;
      const iframeWin = iframe.contentWindow;
      if (!iframeDoc || !iframeWin) return;

      const container = iframeDoc.body;

      // Set up contentEditable on text elements
      let editables = container.querySelectorAll('[data-editable="true"]');
      if (editables.length === 0) {
        editables = container.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, p, li, td, th, span, div",
        );
      }
      editables.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const hasDirectText = Array.from(htmlEl.childNodes).some(
          (n) =>
            n.nodeType === Node.TEXT_NODE &&
            n.textContent &&
            n.textContent.trim().length > 0,
        );
        if (!hasDirectText && !htmlEl.hasAttribute("data-editable")) return;
        htmlEl.contentEditable = "true";
        htmlEl.style.cursor = "text";
        htmlEl.style.outline = "none";
      });

      // Set up drag handles on block elements
      setupDragHandles(container);

      // -- contentEditable focus/blur --
      const handleFocus = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.contentEditable === "true") {
          lastFocusedEditableRef.current = target;
          target.style.outline = "2px solid rgba(20, 184, 166, 0.6)";
          target.style.outlineOffset = "2px";
          target.style.borderRadius = "4px";
        }
      };
      const handleBlur = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.contentEditable === "true") {
          target.style.outline = "none";
        }
      };

      // -- JS-based hover tracking --
      let hoveredBlock: HTMLElement | null = null;
      const onHoverMove = (e: MouseEvent) => {
        const block = (e.target as HTMLElement).closest(
          "[data-draggable]",
        ) as HTMLElement | null;
        if (block === hoveredBlock) return;
        if (hoveredBlock) hoveredBlock.removeAttribute("data-hovered");
        if (block) block.setAttribute("data-hovered", "");
        hoveredBlock = block;
      };
      const onHoverLeave = () => {
        if (hoveredBlock) {
          hoveredBlock.removeAttribute("data-hovered");
          hoveredBlock = null;
        }
      };

      // -- Shift+click multi-select --
      const selectedBlocks = new Set<HTMLElement>();
      const onShiftClick = (e: MouseEvent) => {
        if (!e.shiftKey) return;
        const target = e.target as HTMLElement;
        if (
          target.contentEditable === "true" ||
          target.closest('[contenteditable="true"]')
        )
          return;
        if (
          target.closest("[data-drag-toolbar]") ||
          target.closest("[data-resize]")
        )
          return;
        const block = target.closest("[data-draggable]") as HTMLElement | null;
        if (!block) return;
        e.preventDefault();
        if (selectedBlocks.has(block)) {
          selectedBlocks.delete(block);
          block.removeAttribute("data-selected");
        } else {
          selectedBlocks.add(block);
          block.setAttribute("data-selected", "");
        }
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && selectedBlocks.size > 0) {
          for (const b of selectedBlocks) b.removeAttribute("data-selected");
          selectedBlocks.clear();
        }
      };

      // -- Drag-to-move + Copy/Delete --
      let dragging = false;
      let dragEl: HTMLElement | null = null;
      let startX = 0;
      let startY = 0;

      const onDragMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const actionBtn = target.closest(
          "[data-block-action]",
        ) as HTMLElement | null;
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          const block = actionBtn.closest(
            "[data-draggable]",
          ) as HTMLElement | null;
          if (!block) return;
          const action = actionBtn.getAttribute("data-block-action");
          if (action === "delete") {
            selectedBlocks.delete(block);
            block.remove();
            return;
          }
          if (action === "copy") {
            const clone = block.cloneNode(true) as HTMLElement;
            clone
              .querySelectorAll("[data-drag-toolbar]")
              .forEach((el) => el.remove());
            clone
              .querySelectorAll("[data-resize]")
              .forEach((el) => el.remove());
            clone.removeAttribute("data-draggable");
            clone.removeAttribute("data-drag-pos");
            clone.removeAttribute("data-hovered");
            clone.removeAttribute("data-selected");
            const prevDx = parseFloat(clone.dataset.dragX || "0");
            const prevDy = parseFloat(clone.dataset.dragY || "0");
            clone.dataset.dragX = String(prevDx + 20);
            clone.dataset.dragY = String(prevDy + 20);
            const orig = clone.dataset.dragOrigTransform || "";
            clone.style.transform = orig
              ? `translate(${prevDx + 20}px,${prevDy + 20}px) ${orig}`
              : `translate(${prevDx + 20}px,${prevDy + 20}px)`;
            block.parentElement?.insertBefore(clone, block.nextSibling);
            setupDragHandles(container);
            return;
          }
          return;
        }

        const handle = target.closest("[data-drag-handle]");
        if (!handle) return;
        e.preventDefault();
        e.stopPropagation();
        const block = handle.closest("[data-draggable]") as HTMLElement | null;
        if (!block) return;
        dragging = true;
        dragEl = block;
        startX = e.clientX;
        startY = e.clientY;
        dragEl.setAttribute("data-dragging", "");
        if (selectedBlocks.has(block)) {
          for (const b of selectedBlocks) {
            if (b !== block) b.setAttribute("data-dragging", "");
          }
        }
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      };

      // mousemove/mouseup on parent document (mouse can leave iframe)
      const onDragMouseMove = (e: MouseEvent) => {
        if (!dragging || !dragEl) return;
        e.preventDefault();
        const s = scaleRef.current;
        const dx = (e.clientX - startX) / s;
        const dy = (e.clientY - startY) / s;
        startX = e.clientX;
        startY = e.clientY;
        applyDragTranslate(dragEl, dx, dy);
        if (selectedBlocks.has(dragEl)) {
          for (const b of selectedBlocks) {
            if (b !== dragEl) applyDragTranslate(b, dx, dy);
          }
        }
      };

      const onDragMouseUp = () => {
        if (!dragging || !dragEl) return;
        dragEl.removeAttribute("data-dragging");
        if (selectedBlocks.has(dragEl)) {
          for (const b of selectedBlocks) b.removeAttribute("data-dragging");
        }
        dragging = false;
        dragEl = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      // -- Resize --
      let resizing = false;
      let resizeEl: HTMLElement | null = null;
      let resizeDir = "";
      let resizeStartX = 0;
      let resizeStartY = 0;
      let resizeInitW = 0;
      let resizeInitH = 0;

      const onResizeMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const handle = target.closest("[data-resize]") as HTMLElement | null;
        if (!handle) return;
        const block = handle.closest("[data-draggable]") as HTMLElement | null;
        if (!block) return;
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        resizeEl = block;
        resizeDir = handle.getAttribute("data-resize") || "se";
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeInitW = block.offsetWidth;
        resizeInitH = block.offsetHeight;
        block.setAttribute("data-resizing", "");
        document.body.style.cursor = `${resizeDir}-resize`;
        document.body.style.userSelect = "none";
      };

      const onResizeMouseMove = (e: MouseEvent) => {
        if (!resizing || !resizeEl) return;
        e.preventDefault();
        const s = scaleRef.current;
        const rawDx = (e.clientX - resizeStartX) / s;
        const rawDy = (e.clientY - resizeStartY) / s;

        let newW = resizeInitW;
        let newH = resizeInitH;
        let translateDx = 0;
        let translateDy = 0;
        const dir = resizeDir;

        if (dir.includes("e")) newW = Math.max(48, resizeInitW + rawDx);
        if (dir.includes("w")) {
          newW = Math.max(48, resizeInitW - rawDx);
          translateDx = resizeInitW - newW;
        }
        if (dir.includes("s")) newH = Math.max(24, resizeInitH + rawDy);
        if (dir.includes("n")) {
          newH = Math.max(24, resizeInitH - rawDy);
          translateDy = resizeInitH - newH;
        }

        resizeEl.style.width = `${newW}px`;
        resizeEl.style.height = `${newH}px`;
        if (!resizeEl.dataset.resizeOrigW) {
          resizeEl.dataset.resizeOrigW = String(resizeInitW);
          resizeEl.dataset.resizeOrigH = String(resizeInitH);
        }
        if (translateDx !== 0 || translateDy !== 0) {
          const baseDx = parseFloat(resizeEl.dataset.dragX || "0");
          const baseDy = parseFloat(resizeEl.dataset.dragY || "0");
          const origTransform = resizeEl.dataset.dragOrigTransform || "";
          const totalDx = baseDx + translateDx;
          const totalDy = baseDy + translateDy;
          resizeEl.style.transform = origTransform
            ? `translate(${totalDx}px,${totalDy}px) ${origTransform}`
            : `translate(${totalDx}px,${totalDy}px)`;
          resizeEl.dataset.resizeTempDx = String(translateDx);
          resizeEl.dataset.resizeTempDy = String(translateDy);
        }
      };

      const onResizeMouseUp = () => {
        if (!resizing || !resizeEl) return;
        resizeEl.removeAttribute("data-resizing");
        const tempDx = parseFloat(resizeEl.dataset.resizeTempDx || "0");
        const tempDy = parseFloat(resizeEl.dataset.resizeTempDy || "0");
        if (tempDx !== 0 || tempDy !== 0) {
          const baseDx = parseFloat(resizeEl.dataset.dragX || "0");
          const baseDy = parseFloat(resizeEl.dataset.dragY || "0");
          resizeEl.dataset.dragX = String(baseDx + tempDx);
          resizeEl.dataset.dragY = String(baseDy + tempDy);
        }
        delete resizeEl.dataset.resizeTempDx;
        delete resizeEl.dataset.resizeTempDy;
        resizing = false;
        resizeEl = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      // Attach listeners: iframe doc for interactions, parent doc for mouse tracking
      iframeDoc.addEventListener("focusin", handleFocus);
      iframeDoc.addEventListener("focusout", handleBlur);
      iframeDoc.addEventListener("mouseover", onHoverMove);
      iframeDoc.addEventListener("mouseleave", onHoverLeave);
      iframeDoc.addEventListener("click", onShiftClick);
      iframeDoc.addEventListener("mousedown", onDragMouseDown);
      iframeDoc.addEventListener("mousedown", onResizeMouseDown);
      document.addEventListener("mousemove", onDragMouseMove);
      document.addEventListener("mousemove", onResizeMouseMove);
      document.addEventListener("mouseup", onDragMouseUp);
      document.addEventListener("mouseup", onResizeMouseUp);
      iframeDoc.addEventListener("keydown", onKeyDown);

      return () => {
        iframeDoc.removeEventListener("focusin", handleFocus);
        iframeDoc.removeEventListener("focusout", handleBlur);
        iframeDoc.removeEventListener("mouseover", onHoverMove);
        iframeDoc.removeEventListener("mouseleave", onHoverLeave);
        iframeDoc.removeEventListener("click", onShiftClick);
        iframeDoc.removeEventListener("mousedown", onDragMouseDown);
        iframeDoc.removeEventListener("mousedown", onResizeMouseDown);
        document.removeEventListener("mousemove", onDragMouseMove);
        document.removeEventListener("mousemove", onResizeMouseMove);
        document.removeEventListener("mouseup", onDragMouseUp);
        document.removeEventListener("mouseup", onResizeMouseUp);
        iframeDoc.removeEventListener("keydown", onKeyDown);
        cleanupDragHandles(container);
      };
    };

    // Wait for iframe to be ready
    let cleanup: (() => void) | undefined;
    const tryInit = () => {
      try {
        if (iframe.contentDocument?.readyState === "complete") {
          cleanup = initEditing();
        }
      } catch {
        // cross-origin, retry on load
      }
    };

    const onLoad = () => {
      cleanup = initEditing();
    };

    // iframe may not be ready immediately after activeIndex change (React remounts it).
    // Try init immediately, then listen for load, and also poll briefly as fallback.
    tryInit();
    if (!cleanup) {
      iframe.addEventListener("load", onLoad, { once: true });
      // Fallback: poll for iframe readiness (handles React key-based remount timing)
      const poll = setInterval(() => {
        const currentIframe = iframeRef.current;
        if (!currentIframe) return;
        try {
          if (currentIframe.contentDocument?.readyState === "complete") {
            clearInterval(poll);
            if (!cleanup) cleanup = initEditing();
          }
        } catch { /* cross-origin */ }
      }, 200);
      const pollTimeout = setTimeout(() => clearInterval(poll), 3000);
      return () => {
        iframe.removeEventListener("load", onLoad);
        clearInterval(poll);
        clearTimeout(pollTimeout);
        cleanup?.();
      };
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup?.();
    };
  }, [editing, activeIndex, phase]);

  // ============================================================
  // Persist, font, fontSize, redraw callbacks
  // ============================================================

  const persistCurrentSlide = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const container = iframe.contentDocument.body;

    // Remove contentEditable
    container.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      (el as HTMLElement).removeAttribute("contenteditable");
      (el as HTMLElement).style.cursor = "";
      (el as HTMLElement).style.outline = "none";
    });

    // Remove drag UI
    cleanupDragHandles(container);

    const updatedHtml = container.innerHTML;

    // Apply font override
    const cssFont = editFontRef.current;
    const overrideTag = `<style id="__font-override">* { font-family: ${cssFont} !important; }</style>`;
    setGeneratedSlides((prev) =>
      prev.map((s, i) => {
        if (i === activeIndex) return { ...s, html: updatedHtml };
        const cleaned = s.html.replace(
          /<style id="__font-override">[^<]*<\/style>/g,
          "",
        );
        return { ...s, html: overrideTag + cleaned };
      }),
    );
    setSaved(false);
  }, [activeIndex]);

  const applyGlobalFont = useCallback((cssFont: string) => {
    editFontRef.current = cssFont;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const iframeDoc = iframe.contentDocument;
    const styleId = "__font-override";
    let styleEl = iframeDoc.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = iframeDoc.createElement("style");
      styleEl.id = styleId;
      iframeDoc.head.appendChild(styleEl);
    }
    styleEl.textContent = `* { font-family: ${cssFont} !important; }`;
  }, []);

  const adjustFocusedFontSize = useCallback((delta: number) => {
    const target = lastFocusedEditableRef.current;
    const iframe = iframeRef.current;
    if (!target || !iframe?.contentWindow) return;
    if (!iframe.contentDocument?.body.contains(target)) return;
    const computed = iframe.contentWindow.getComputedStyle(target);
    const current = parseFloat(computed.fontSize) || 16;
    const next = Math.max(8, Math.min(120, current + delta));
    target.style.fontSize = `${next}px`;
  }, []);

  const redrawCurrentSlide = useCallback(async () => {
    const slide = generatedSlides[activeIndex];
    if (!slide) return;

    persistCurrentSlide();
    setRedrawing(true);

    try {
      const section = slideSections[activeIndex];
      if (!section) throw new Error("Slide section not found");

      const res = await fetch("/api/slides/htmlslide/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slide_plan_section: section.plan_text,
          slide_title: section.title,
          slide_index: activeIndex,
          total_slides: slideSections.length,
          deck_title: deckTitle,
          slide_type: section.type,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let detail = `HTTP ${res.status}`;
        try {
          detail = JSON.parse(text).detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setGeneratedSlides((prev) =>
        prev.map((s, i) =>
          i === activeIndex ? { ...s, html: data.html || "" } : s,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redraw failed");
    } finally {
      setRedrawing(false);
    }
  }, [
    generatedSlides,
    activeIndex,
    slideSections,
    deckTitle,
    persistCurrentSlide,
  ]);

  const handleToggleEditing = useCallback(() => {
    if (editing) {
      persistCurrentSlide();
      setEditing(false);
    } else {
      setEditing(true);
    }
  }, [editing, persistCurrentSlide]);

  // Persist before switching slides
  const handleSlideChange = useCallback(
    (newIndex: number) => {
      if (editing) persistCurrentSlide();
      setActiveIndex(newIndex);
    },
    [editing, persistCurrentSlide],
  );

  // ============================================================
  // Keyboard navigation
  // ============================================================

  useEffect(() => {
    if (phase !== "done" || !open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.contentEditable === "true"
      )
        return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          handleSlideChange(
            Math.min(activeIndex + 1, generatedSlides.length - 1),
          );
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSlideChange(Math.max(activeIndex - 1, 0));
          break;
        case "Escape":
          e.preventDefault();
          if (editing) {
            handleToggleEditing();
          } else if (expanded) {
            setExpanded(false);
          } else {
            closePanel();
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    phase,
    open,
    generatedSlides.length,
    closePanel,
    editing,
    expanded,
    activeIndex,
    handleSlideChange,
    handleToggleEditing,
  ]);

  // Reload slides when reviseSlides tool triggers a refresh
  useEffect(() => {
    if (refreshToken === 0 || !currentDeckId) return;
    fetchSlideDeckDetail(currentDeckId)
      .then((detail) => {
        const slides = detail.slides.map((s) => ({
          index: s.slide_index,
          title: s.title,
          html: s.html,
          type: s.slide_type,
        }));
        setGeneratedSlides(slides);
        setDeckTitle(detail.title);
        storeSetCachedSlides(slides, detail.title);
        setSaved(true);
        // Update version
        const ver = detail.current_version ?? 1;
        setCurrentVersion(ver);
        setMaxVersion(ver);
        setBrowsingVersion(null);
        setVersionSlides(null);
      })
      .catch((e) => {
        console.error("[slide-panel] refresh failed:", e);
      });
  }, [refreshToken, currentDeckId]);

  if (!open) return null;

  // ============================================================
  // Panel resize handlers
  // ============================================================

  // ============================================================
  // Version browsing
  // ============================================================

  const handleBrowseVersion = useCallback(
    async (direction: "prev" | "next") => {
      if (!currentDeckId) return;
      const target = browsingVersion ?? currentVersion;
      const newTarget = direction === "prev" ? target - 1 : target + 1;
      if (newTarget < 1 || newTarget > maxVersion) return;

      if (newTarget === currentVersion) {
        // Return to current version
        setBrowsingVersion(null);
        setVersionSlides(null);
        return;
      }

      try {
        const slides = await fetchSlidesAtVersion(currentDeckId, newTarget);
        setBrowsingVersion(newTarget);
        setVersionSlides(
          slides.map((s) => ({
            index: s.slide_index,
            title: s.title,
            html: s.html,
            type: s.slide_type,
          })),
        );
        setActiveIndex(0);
      } catch (e) {
        console.error("[slide-panel] browse version failed:", e);
      }
    },
    [currentDeckId, browsingVersion, currentVersion, maxVersion],
  );

  const handleRestoreVersion = useCallback(async () => {
    if (!currentDeckId || !browsingVersion) return;
    setRestoringVersion(true);
    try {
      const { version: newVer } = await restoreSlideVersion(
        currentDeckId,
        browsingVersion,
      );
      // Reload slides from DB
      const detail = await fetchSlideDeckDetail(currentDeckId);
      const slides = detail.slides.map((s) => ({
        index: s.slide_index,
        title: s.title,
        html: s.html,
        type: s.slide_type,
      }));
      setGeneratedSlides(slides);
      setDeckTitle(detail.title);
      setCurrentVersion(newVer);
      setMaxVersion(newVer);
      setBrowsingVersion(null);
      setVersionSlides(null);
      storeSetCachedSlides(slides, detail.title);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringVersion(false);
    }
  }, [currentDeckId, browsingVersion, storeSetCachedSlides]);

  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    panelResizingRef.current = true;
    panelResizeStartXRef.current = e.clientX;
    panelResizeStartWRef.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!panelResizingRef.current) return;
      // Dragging left edge: moving left = wider, moving right = narrower
      const delta = panelResizeStartXRef.current - ev.clientX;
      const newW = Math.max(
        400,
        Math.min(900, panelResizeStartWRef.current + delta),
      );
      setPanelWidth(newW);
    };
    const onUp = () => {
      panelResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Trigger scale recalc
      requestAnimationFrame(updateScale);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ============================================================
  // Render
  // ============================================================

  const displaySlides = browsingVersion ? (versionSlides ?? generatedSlides) : generatedSlides;
  const activeSlide = displaySlides[activeIndex];
  const isWorking = phase === "planning" || phase === "generating";
  const isBrowsingHistory = browsingVersion !== null;

  // Shared header content (used in both panel and expanded modes)
  const headerContent = (
    <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border px-3">
      <button
        onClick={expanded ? () => setExpanded(false) : closePanel}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        aria-label={expanded ? "縮小" : "閉じる"}
      >
        <XIcon className="size-4" />
      </button>

      <h2 className="flex-1 truncate text-sm font-medium">
        {deckTitle || "スライド"}
      </h2>

      {/* Version navigation */}
      {phase === "done" && maxVersion > 1 && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <button
            onClick={() => handleBrowseVersion("prev")}
            disabled={(browsingVersion ?? currentVersion) <= 1}
            className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
            aria-label="前のバージョン"
          >
            <ChevronLeftIcon className="size-3" />
          </button>
          <span className={cn("tabular-nums min-w-[4ch] text-center", isBrowsingHistory && "text-amber-500 font-medium")}>
            v{browsingVersion ?? currentVersion}/{maxVersion}
          </span>
          <button
            onClick={() => handleBrowseVersion("next")}
            disabled={(browsingVersion ?? currentVersion) >= maxVersion}
            className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
            aria-label="次のバージョン"
          >
            <ChevronRightIcon className="size-3" />
          </button>
          {isBrowsingHistory && (
            <button
              onClick={handleRestoreVersion}
              disabled={restoringVersion}
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400 disabled:opacity-50"
            >
              {restoringVersion ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <RotateCcwIcon className="size-3" />
              )}
              回復
            </button>
          )}
        </div>
      )}

      {/* Editing toolbar */}
      {phase === "done" && editing && (
        <div className="flex items-center gap-1.5 mr-1">
          {/* Font select */}
          <select
            className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            defaultValue={FONT_PRESETS[0].css}
            onChange={(e) => applyGlobalFont(e.target.value)}
          >
            {FONT_PRESETS.map((f) => (
              <option key={f.label} value={f.css}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Font size controls */}
          <button
            onClick={() => adjustFocusedFontSize(-2)}
            className="flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50"
            title="文字を小さく"
          >
            <MinusIcon className="size-3" />
          </button>
          <button
            onClick={() => adjustFocusedFontSize(2)}
            className="flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50"
            title="文字を大きく"
          >
            <PlusIcon className="size-3" />
          </button>

          {/* Redraw */}
          <button
            onClick={redrawCurrentSlide}
            disabled={redrawing}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            title="再描画"
          >
            {redrawing ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
            再描画
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Save edits */}
          <button
            onClick={handleToggleEditing}
            className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
          >
            <CheckIcon className="size-3" />
            編集完了
          </button>
        </div>
      )}

      {/* Cancel button during work */}
      {isWorking && (
        <button
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="中止"
        >
          <SquareIcon className="size-3" />
          中止
        </button>
      )}

      {phase === "done" && !editing && !isBrowsingHistory && (
        <div className="flex items-center gap-1">
          {failedCount > 0 && (
            <button
              onClick={retryFailed}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              title="失敗したスライドを再試行"
            >
              <RotateCcwIcon className="size-3" />
              {failedCount}枚再試行
            </button>
          )}
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/50 px-0.5">
            <button
              onClick={() => {
                const s = Math.max(0.2, scaleRef.current - 0.1);
                scaleRef.current = s;
                setScale(s);
              }}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              title="縮小"
            >
              <MinusIcon className="size-3" />
            </button>
            <span className="min-w-[3ch] text-center text-[10px] text-muted-foreground tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => {
                const s = Math.min(1.5, scaleRef.current + 0.1);
                scaleRef.current = s;
                setScale(s);
              }}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              title="拡大"
            >
              <PlusIcon className="size-3" />
            </button>
          </div>
          <button
            onClick={() => setFullscreen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            title="全画面プレゼン"
          >
            <PlayIcon className="size-3.5" />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            title={expanded ? "パネルに戻す" : "全画面編集"}
          >
            {expanded ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </button>
          <button
            onClick={handleToggleEditing}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              editing
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            title={editing ? "編集終了" : "編集"}
          >
            <Edit3Icon className="size-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            title="保存"
          >
            {saving ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : saved ? (
              <CheckIcon className="size-3.5 text-green-500" />
            ) : (
              <SaveIcon className="size-3.5" />
            )}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || exportingPdf}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            title="PPTX エクスポート"
          >
            {exporting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="size-3.5" />
            )}
          </button>
          <button
            onClick={handlePdfExport}
            disabled={exporting || exportingPdf}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            title="PDF エクスポート"
          >
            {exportingPdf ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <FileDownIcon className="size-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );

  // Shared content body
  const contentBody = (
    <div className="flex flex-1 flex-col overflow-hidden">
      {(phase === "planning" || phase === "loading" || phase === "plan_ready") && (
        <PhasePlanning
          phase={phase}
          deckTitle={deckTitle}
          slideSections={slideSections}
          onFetchPlan={fetchPlanFromApi}
          onStartGeneration={startGeneration}
        />
      )}

      {phase === "generating" && (
        <PhaseGenerating
          slides={generatedSlides}
          sections={slideSections}
          total={generatingTotal}
          completed={generatingCompleted}
        />
      )}

      {phase === "done" && activeSlide && (
        <PhaseViewer
          activeSlide={activeSlide}
          activeIndex={activeIndex}
          generatedSlides={displaySlides}
          scale={scale}
          editing={editing && !isBrowsingHistory}
          error={error}
          iframeRef={iframeRef}
          mainAreaRef={mainAreaRef}
          slideContainerRef={slideContainerRef}
          onSlideChange={handleSlideChange}
          onClearError={() => setError(null)}
        />
      )}

      {phase === "error" && (
        <PhaseError error={error} onRetry={fetchPlanFromApi} />
      )}
    </div>
  );

  // Expanded (fullscreen editing) mode
  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {headerContent}
          {contentBody}
        </div>

        {/* Fullscreen presenter */}
        {fullscreen && phase === "done" && (
          <FullscreenPresenter
            slides={generatedSlides
              .filter((s) => !s.failed)
              .map((s) => ({
                html: slideSrcDoc(s.html),
                title: s.title,
              }))}
            initialIndex={Math.min(
              activeIndex,
              generatedSlides.filter((s) => !s.failed).length - 1,
            )}
            onExit={() => setFullscreen(false)}
          />
        )}
      </>
    );
  }

  // Normal right-side panel mode
  return (
    <>
      <div
        className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
        style={{ width: panelWidth }}
      >
        {/* Resize handle (left edge) */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={handlePanelResizeStart}
        />

        {headerContent}
        {contentBody}
      </div>

      {/* Fullscreen presenter */}
      {fullscreen && phase === "done" && (
        <FullscreenPresenter
          slides={generatedSlides
            .filter((s) => !s.failed)
            .map((s) => ({
              html: slideSrcDoc(s.html),
              title: s.title,
            }))}
          initialIndex={Math.min(
            activeIndex,
            generatedSlides.filter((s) => !s.failed).length - 1,
          )}
          onExit={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
