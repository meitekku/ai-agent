"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSlidePanelStore } from "@/lib/slide-panel-store";
import {
  saveSlideDeck,
  updateSlideDeck,
  fetchSlideDeckDetail,
} from "@/lib/slide-api";
import { FullscreenPresenter } from "@/components/fullscreen-presenter";

import { SLIDE_W, SLIDE_H, PLAN_TIMEOUT_MS, RENDER_TIMEOUT_MS } from "./constants";
import type { SlideSection, GeneratedSlide, Phase } from "./types";
import {
  slideSrcDoc,
  failedSlideHtml,
  parsePlanMd,
  fetchWithRetry,
} from "./utils";
import { PhasePlanning } from "./phase-planning";
import { PhaseGenerating } from "./phase-generating";
import { PhaseViewer } from "./phase-viewer";
import { PhaseError } from "./phase-error";
import { PanelHeader } from "./panel-header";
import { useSlideExport } from "./use-slide-export";
import { useSlideEditing } from "./use-slide-editing";
import { useSlideVersions } from "./use-slide-versions";

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

  // DB save
  const [currentDeckId, setCurrentDeckId] = useState<number | null>(deckId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fullscreen presentation
  const [fullscreen, setFullscreen] = useState(false);

  // Expanded (fullscreen editing) mode
  const [expanded, setExpanded] = useState(false);

  // Resizable panel width
  const [panelWidth, setPanelWidth] = useState(560);
  const panelResizingRef = useRef(false);
  const panelResizeStartXRef = useRef(0);
  const panelResizeStartWRef = useRef(560);

  // Refs
  const currentDeckIdRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const scaleRef = useRef(0.5);
  const [scale, setScale] = useState(0.5);
  const initiatedRef = useRef(false);
  const prevDataRef = useRef({ question: "", answer: "" });

  // Keep ref in sync with state
  useEffect(() => {
    currentDeckIdRef.current = currentDeckId;
  }, [currentDeckId]);

  const failedCount = generatedSlides.filter((s) => s?.failed).length;

  // ============================================================
  // Custom hooks
  // ============================================================

  const {
    exporting,
    exportingPdf,
    handleExport,
    handlePdfExport,
    handleHtmlExport,
  } = useSlideExport(generatedSlides, deckTitle, setError);

  const {
    editing,
    setEditing,
    redrawing,
    applyGlobalFont,
    adjustFocusedFontSize,
    redrawCurrentSlide,
    handleToggleEditing,
    handleSlideChange,
  } = useSlideEditing({
    phase,
    activeIndex,
    setActiveIndex,
    generatedSlides,
    setGeneratedSlides,
    slideSections,
    deckTitle,
    iframeRef,
    scaleRef,
    setError,
    setSaved,
  });

  const {
    currentVersion,
    setCurrentVersion,
    maxVersion,
    setMaxVersion,
    browsingVersion,
    setBrowsingVersion,
    versionSlides,
    setVersionSlides,
    restoringVersion,
    isBrowsingHistory,
    handleBrowseVersion,
    handleRestoreVersion,
  } = useSlideVersions({
    currentDeckId,
    setGeneratedSlides,
    setDeckTitle,
    setActiveIndex,
    setError,
    setSaved,
    storeSetCachedSlides,
  });

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

    const dataChanged =
      prevDataRef.current.question !== question ||
      prevDataRef.current.answer !== answer;
    if (dataChanged && (question || answer)) {
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
      prevDataRef.current = { question, answer };
    }

    initiatedRef.current = true;

    if (deckId) {
      loadDeckFromDb(deckId);
    } else if (storeCachedSlides && storeCachedSlides.length > 0 && conversationDeckId) {
      setDeckTitle(storeCachedTitle || "");
      setCurrentDeckId(conversationDeckId);
      setGeneratedSlides(storeCachedSlides.map((s) => ({ ...s, failed: false })));
      setPhase("done");
      setActiveIndex(0);
      setSaved(true);
    } else if (question && answer) {
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

        let parsedSections: SlideSection[] = [];
        if (detail.plan_md) {
          setPlanMd(detail.plan_md);
          const parsed = parsePlanMd(detail.plan_md);
          parsedSections = parsed.slides;
          setSlideSections(parsedSections);
        }

        const slides = detail.slides.map((s) => ({
          index: s.slide_index,
          title: s.title,
          html: s.html,
          type: s.slide_type,
        }));

        // Detect partial deck → auto-resume
        if (parsedSections.length > 0 && slides.length < parsedSections.length) {
          const existingSlides: GeneratedSlide[] = parsedSections.map((sec, i) => {
            const existing = slides.find((s) => s.index === i);
            if (existing) return { ...existing, failed: false };
            return { index: i, title: sec.title, html: "", type: sec.type };
          });
          setGeneratedSlides(existingSlides);
          setActiveIndex(0);
          renderSlides(parsedSections, detail.title, existingSlides, detail.style_options as any);
          return;
        }

        setGeneratedSlides(slides);
        setPhase("done");
        setActiveIndex(0);
        const ver = detail.current_version ?? 1;
        setCurrentVersion(ver);
        setMaxVersion(ver);
        setBrowsingVersion(null);
        setVersionSlides(null);
        storeSetCachedSlides(slides, detail.title);
        setConversationDeckId(detail.id);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load deck");
        setPhase("error");
      });
  };

  // Handle open/close transitions
  useEffect(() => {
    if (open) {
      const sameData =
        prevDataRef.current.question === question &&
        prevDataRef.current.answer === answer;
      if (sameData && generatedSlides.length > 0 && !initiatedRef.current) {
        initiatedRef.current = true;
        setPhase("done");
        setEditing(false);
        setExpanded(false);
        return;
      }
    } else {
      setEditing(false);
      setExpanded(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      initiatedRef.current = false;
    }
  }, [open, question, answer, generatedSlides.length, setEditing]);

  // ============================================================
  // Phase 1: Plan
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
          body: JSON.stringify({ question, answer, instructions, styleOptions }),
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

      // Save draft deck to DB
      try {
        const pathMatch = window.location.pathname.match(/\/chat\/(.+)/);
        const conversationId = pathMatch?.[1] || undefined;
        const result = await saveSlideDeck({
          title: parsed.title || question,
          question,
          answer,
          plan_md: md,
          conversation_id: conversationId,
          style_options: styleOptions
            ? (Object.fromEntries(
                Object.entries(styleOptions).filter(([, v]) => v !== undefined),
              ) as Record<string, string | undefined>)
            : undefined,
          slides: [],
        });
        setCurrentDeckId(result.id);
        setConversationDeckId(result.id);
      } catch {
        // Draft save failure is non-critical
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to generate plan");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [question, answer, instructions, styleOptions, setConversationDeckId]);

  // ============================================================
  // Phase 2: Render slides
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

      const pending = sections
        .map((_, i) => i)
        .filter((i) => !existingSlides?.[i] || existingSlides[i].failed);
      let doneCount = sections.length - pending.length;
      let newFailCount = 0;
      setGeneratingCompleted(doneCount);

      try {
        async function renderOne(idx: number, templateHtml?: string) {
          const section = sections[idx];
          try {
            const body: Record<string, unknown> = {
              slide_plan_section: section.plan_text,
              slide_title: section.title,
              slide_index: idx,
              total_slides: sections.length,
              deck_title: title,
              slide_type: section.type,
              style_options: renderStyleOptions || undefined,
            };
            if (templateHtml) body.template_html = templateHtml;

            const res = await fetchWithRetry(
              "/api/slides/htmlslide/render",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
              },
              RENDER_TIMEOUT_MS,
            );

            if (!res.ok) {
              const text = await res.text();
              let detail = `HTTP ${res.status}`;
              try {
                detail = JSON.parse(text).detail || detail;
              } catch {
                /* */
              }
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

          // Incremental save (debounced)
          const deckIdNow = currentDeckIdRef.current;
          if (deckIdNow && !slides[idx]?.failed) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
              const completed = slides
                .filter((s) => s && s.html && !s.failed)
                .map((s, i) => ({
                  slide_index: i,
                  title: s.title,
                  slide_type: s.type,
                  html: s.html,
                }));
              if (completed.length > 0) {
                updateSlideDeck(deckIdNow, { slides: completed }).catch(() => {});
              }
            }, 1500);
          }
        }

        // Two-phase rendering for style consistency
        const coverIdx = pending.find((i) => sections[i].type === "cover");
        const firstContentIdx = pending.find(
          (i) => sections[i].type !== "cover" && sections[i].type !== "back-cover",
        );

        const phaseA: number[] = [];
        if (coverIdx !== undefined) phaseA.push(coverIdx);
        if (firstContentIdx !== undefined) phaseA.push(firstContentIdx);
        if (phaseA.length === 0 && pending.length > 0) phaseA.push(pending[0]);

        if (controller.signal.aborted) return;
        await Promise.all(phaseA.map((idx) => renderOne(idx)));

        const templateHtml =
          firstContentIdx !== undefined && slides[firstContentIdx] && !slides[firstContentIdx].failed
            ? slides[firstContentIdx].html
            : undefined;

        const phaseB = pending.filter((i) => !phaseA.includes(i));

        if (phaseB.length > 0 && !controller.signal.aborted) {
          const CONCURRENCY = 3;
          let cursor = 0;

          async function worker() {
            while (cursor < phaseB.length) {
              if (controller.signal.aborted) return;
              const idx = phaseB[cursor++];
              const tpl = sections[idx].type !== "back-cover" ? templateHtml : undefined;
              await renderOne(idx, tpl);
            }
          }

          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, phaseB.length) }, () => worker()),
          );
        }

        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        setPhase("done");
        setActiveIndex(0);

        const successSlides = slides.filter((s) => !s.failed);
        if (successSlides.length > 0) {
          autoSave(slides);
        }

        if (newFailCount > 0) {
          setError(`${newFailCount}枚のスライド生成に失敗しました。再試行できます。`);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;

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

        const existingId = currentDeckIdRef.current;

        if (existingId) {
          await updateSlideDeck(existingId, { slides: slidesData });
          setSaved(true);
        } else {
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
          setConversationDeckId(result.id);
          setSaved(true);
          setCurrentVersion(1);
          setMaxVersion(1);
        }

        const cached = slides
          .filter((s) => !s.failed)
          .map((s) => ({ index: s.index, title: s.title, html: s.html, type: s.type }));
        storeSetCachedSlides(cached, deckTitle || question);
        if (existingId) setConversationDeckId(existingId);
      } catch {
        // Auto-save failure is non-critical
      }
    },
    [deckTitle, question, answer, planMd, slideSections, storeSetCachedSlides, setConversationDeckId, setCurrentVersion, setMaxVersion],
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
  }, [generatedSlides, currentDeckId, deckTitle, question, answer, planMd, slideSections]);

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
          handleSlideChange(Math.min(activeIndex + 1, generatedSlides.length - 1));
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
  }, [phase, open, generatedSlides.length, closePanel, editing, expanded, activeIndex, handleSlideChange, handleToggleEditing]);

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
        const ver = detail.current_version ?? 1;
        setCurrentVersion(ver);
        setMaxVersion(ver);
        setBrowsingVersion(null);
        setVersionSlides(null);
      })
      .catch((e) => {
        console.error("[slide-panel] refresh failed:", e);
      });
  }, [refreshToken, currentDeckId, storeSetCachedSlides, setCurrentVersion, setMaxVersion, setBrowsingVersion, setVersionSlides]);

  if (!open) return null;

  // ============================================================
  // Panel resize handlers
  // ============================================================

  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    panelResizingRef.current = true;
    panelResizeStartXRef.current = e.clientX;
    panelResizeStartWRef.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!panelResizingRef.current) return;
      const delta = panelResizeStartXRef.current - ev.clientX;
      const newW = Math.max(400, Math.min(900, panelResizeStartWRef.current + delta));
      setPanelWidth(newW);
    };
    const onUp = () => {
      panelResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
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

  const headerContent = (
    <PanelHeader
      phase={phase}
      deckTitle={deckTitle}
      expanded={expanded}
      editing={editing}
      saving={saving}
      saved={saved}
      exporting={exporting}
      exportingPdf={exportingPdf}
      redrawing={redrawing}
      scale={scale}
      scaleRef={scaleRef}
      failedCount={failedCount}
      maxVersion={maxVersion}
      currentVersion={currentVersion}
      browsingVersion={browsingVersion}
      isBrowsingHistory={isBrowsingHistory}
      restoringVersion={restoringVersion}
      closePanel={closePanel}
      setExpanded={setExpanded}
      setScale={setScale}
      setFullscreen={setFullscreen}
      handleToggleEditing={handleToggleEditing}
      applyGlobalFont={applyGlobalFont}
      adjustFocusedFontSize={adjustFocusedFontSize}
      redrawCurrentSlide={redrawCurrentSlide}
      handleCancel={handleCancel}
      handleSave={handleSave}
      handleExport={handleExport}
      handlePdfExport={handlePdfExport}
      handleHtmlExport={handleHtmlExport}
      retryFailed={retryFailed}
      handleBrowseVersion={handleBrowseVersion}
      handleRestoreVersion={handleRestoreVersion}
    />
  );

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

  // Fullscreen presenter (shared between expanded and panel modes)
  const fullscreenPresenter = fullscreen && phase === "done" && (
    <FullscreenPresenter
      slides={(() => {
        const valid = generatedSlides.filter((s) => !s.failed);
        return valid.map((s, i) => ({
          html: slideSrcDoc(s.html, i + 1, valid.length),
          title: s.title,
        }));
      })()}
      initialIndex={Math.min(
        activeIndex,
        generatedSlides.filter((s) => !s.failed).length - 1,
      )}
      onExit={() => setFullscreen(false)}
    />
  );

  // Expanded (fullscreen editing) mode
  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {headerContent}
          {contentBody}
        </div>
        {fullscreenPresenter}
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
      {fullscreenPresenter}
    </>
  );
}
