"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSlidePanelStore } from "@/lib/slide-panel-store";
import {
  saveSlideDeck,
  updateSlideDeck,
  fetchSlideDeckDetail,
} from "@/lib/slide-api";
import { FullscreenPresenter } from "@/components/fullscreen-presenter";
import {
  XIcon,
  Loader2Icon,
  PlayIcon,
  SaveIcon,
  DownloadIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Edit3Icon,
  MaximizeIcon,
  RefreshCwIcon,
  FileDownIcon,
} from "lucide-react";

// ============================================================
// Constants
// ============================================================

const SLIDE_W = 1280;
const SLIDE_H = 720;

const SLIDE_CDN_HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
<script src="https://unpkg.com/lucide@latest"><\/script>
<style>body { font-family: 'Noto Sans JP', 'Inter', sans-serif; margin: 0; }</style>`;

function slideSrcDoc(html: string) {
  return `<!DOCTYPE html>
<html><head>${SLIDE_CDN_HEAD}</head>
<body style="margin:0;padding:0;overflow:hidden;">
${html}
<script>lucide.createIcons();<\/script>
</body></html>`;
}

// ============================================================
// Types
// ============================================================

type SlideSection = {
  title: string;
  type: "cover" | "content" | "back-cover";
  plan_text: string;
};

type GeneratedSlide = {
  index: number;
  title: string;
  html: string;
  type: string;
};

type Phase =
  | "planning"
  | "plan_ready"
  | "generating"
  | "done"
  | "error"
  | "loading";

// ============================================================
// parsePlanMd (same logic as html-slide-viewer)
// ============================================================

function parsePlanMd(md: string): { title: string; slides: SlideSection[] } {
  const lines = md.split("\n");
  let title = "Slides";
  const slides: SlideSection[] = [];
  let current: SlideSection | null = null;

  for (const line of lines) {
    const stripped = line.trim();

    if (/^#\s+/.test(stripped) && !/^##/.test(stripped)) {
      title = stripped.replace(/^#\s+/, "").trim();
      continue;
    }

    const slideMatch = stripped.match(/^##\s+スライド\d+[:\s：]\s*(.+)/);
    if (slideMatch) {
      if (current) slides.push(current);
      current = { title: slideMatch[1].trim(), type: "content", plan_text: "" };
      continue;
    }

    if (/^##\s+/.test(stripped) && !slideMatch) {
      if (current) slides.push(current);
      current = {
        title: stripped.replace(/^##\s+/, "").trim(),
        type: "content",
        plan_text: "",
      };
      continue;
    }

    if (current) {
      current.plan_text += line + "\n";
      const typeMatch = stripped.match(/^-\s*タイプ[:\s：]\s*(.+)/);
      if (typeMatch) {
        const rawType = typeMatch[1].trim().toLowerCase();
        if (rawType === "cover" || rawType === "back-cover") {
          current.type = rawType;
        } else if (rawType.includes("back") && rawType.includes("cover")) {
          current.type = "back-cover";
        } else if (rawType.includes("cover")) {
          current.type = "cover";
        }
      }
    }
  }

  if (current) slides.push(current);
  return { title, slides };
}

// ============================================================
// SlidePanel
// ============================================================

export function SlidePanel() {
  const { open, question, answer, deckId, closePanel } = useSlidePanelStore();

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

  // Fullscreen
  const [fullscreen, setFullscreen] = useState(false);

  // Refs
  const abortRef = useRef<AbortController | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const initiatedRef = useRef(false);

  // ============================================================
  // Scale calculation
  // ============================================================

  const updateScale = useCallback(() => {
    const el = mainAreaRef.current;
    if (!el) return;
    const padding = 48;
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    const s = Math.max(0.1, Math.min(availW / SLIDE_W, availH / SLIDE_H, 1));
    setScale(s);
  }, []);

  useEffect(() => {
    if (phase !== "done") return;
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [phase, updateScale]);

  // ============================================================
  // Init: load deck from DB or start plan generation
  // ============================================================

  useEffect(() => {
    if (!open || initiatedRef.current) return;
    initiatedRef.current = true;

    if (deckId) {
      // Load from DB
      setPhase("loading");
      fetchSlideDeckDetail(deckId)
        .then((detail) => {
          setDeckTitle(detail.title);
          setCurrentDeckId(detail.id);
          if (detail.plan_md) {
            setPlanMd(detail.plan_md);
            const parsed = parsePlanMd(detail.plan_md);
            setSlideSections(parsed.slides);
          }
          setGeneratedSlides(
            detail.slides.map((s) => ({
              index: s.slide_index,
              title: s.title,
              html: s.html,
              type: s.slide_type,
            })),
          );
          setPhase("done");
          setActiveIndex(0);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to load deck");
          setPhase("error");
        });
    } else if (question && answer) {
      // Start planning
      fetchPlanFromApi();
    }
  }, [open, deckId, question, answer]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      initiatedRef.current = false;
      setPhase("planning");
      setPlanMd("");
      setDeckTitle("");
      setSlideSections([]);
      setGeneratedSlides([]);
      setGeneratingTotal(0);
      setGeneratingCompleted(0);
      setActiveIndex(0);
      setEditing(false);
      setError(null);
      setCurrentDeckId(null);
      setSaving(false);
      setSaved(false);
      setExporting(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }
  }, [open]);

  // ============================================================
  // Phase 1: Plan
  // ============================================================

  const fetchPlanFromApi = useCallback(async () => {
    setPhase("planning");
    setError(null);

    try {
      const res = await fetch("/api/slides/htmlslide/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
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
      const md = data.planMd || data.plan_md || "";
      setPlanMd(md);

      const parsed = parsePlanMd(md);
      setDeckTitle(parsed.title);
      setSlideSections(parsed.slides);
      setPhase("plan_ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
      setPhase("error");
    }
  }, [question, answer]);

  // ============================================================
  // Phase 2: Render slides
  // ============================================================

  const startGeneration = useCallback(async () => {
    if (slideSections.length === 0) return;

    setPhase("generating");
    setError(null);
    setGeneratedSlides([]);
    setGeneratingCompleted(0);
    setGeneratingTotal(slideSections.length);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const slides: GeneratedSlide[] = [];

      for (let i = 0; i < slideSections.length; i++) {
        if (controller.signal.aborted) return;

        const section = slideSections[i];
        const res = await fetch("/api/slides/htmlslide/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slide_plan_section: section.plan_text,
            slide_title: section.title,
            slide_index: i,
            total_slides: slideSections.length,
            deck_title: deckTitle,
            slide_type: section.type,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let detail = `HTTP ${res.status}`;
          try {
            detail = JSON.parse(text).detail || detail;
          } catch {
            /* ignore */
          }
          throw new Error(`Slide ${i + 1}: ${detail}`);
        }

        const data = await res.json();
        slides.push({
          index: i,
          title: section.title,
          html: data.html || "",
          type: section.type,
        });
        setGeneratedSlides([...slides]);
        setGeneratingCompleted(i + 1);
      }

      setPhase("done");
      setActiveIndex(0);

      // Auto-save
      autoSave(slides);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Generation failed");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [slideSections, deckTitle]);

  // ============================================================
  // Auto-save after generation
  // ============================================================

  const autoSave = useCallback(
    async (slides: GeneratedSlide[]) => {
      try {
        const slidesData = slides.map((s, i) => ({
          slide_index: i,
          title: s.title,
          slide_type: s.type,
          html: s.html,
          plan_text: slideSections[i]?.plan_text,
        }));

        const result = await saveSlideDeck({
          title: deckTitle || question,
          question,
          answer,
          plan_md: planMd || undefined,
          slides: slidesData,
        });
        setCurrentDeckId(result.id);
        setSaved(true);
      } catch {
        // Auto-save failure is non-critical
      }
    },
    [deckTitle, question, answer, planMd, slideSections],
  );

  // ============================================================
  // Manual save
  // ============================================================

  const handleSave = useCallback(async () => {
    if (generatedSlides.length === 0) return;
    setSaving(true);

    try {
      const slidesData = generatedSlides.map((s, i) => ({
        slide_index: i,
        title: s.title,
        slide_type: s.type,
        html: s.html,
        plan_text: slideSections[i]?.plan_text,
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
  // PPTX Export
  // ============================================================

  const handleExport = useCallback(async () => {
    if (generatedSlides.length === 0) return;
    setExporting(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const pngs: string[] = [];

      for (let i = 0; i < generatedSlides.length; i++) {
        // Render slide in hidden iframe, capture as PNG
        const container = document.createElement("div");
        container.style.cssText =
          "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "width:1280px;height:720px;border:none;";
        container.appendChild(iframe);
        iframe.srcdoc = slideSrcDoc(generatedSlides[i].html);

        await new Promise<void>((resolve) => {
          iframe.onload = () => resolve();
        });
        await new Promise((r) => setTimeout(r, 2000));

        try {
          const iframeDoc = iframe.contentDocument!;
          const iframeWin = iframe.contentWindow!;
          const sourceBody = iframeDoc.body;

          const wrapper = document.createElement("div");
          wrapper.style.cssText =
            "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
          const bodyComputed = iframeWin.getComputedStyle(sourceBody);
          wrapper.style.background = bodyComputed.background;
          wrapper.style.fontFamily = bodyComputed.fontFamily;
          wrapper.innerHTML = sourceBody.innerHTML;
          document.body.appendChild(wrapper);

          const sourceEls = sourceBody.querySelectorAll("*");
          const cloneEls = wrapper.querySelectorAll("*");
          const styleProps = [
            "display", "position", "top", "right", "bottom", "left",
            "width", "height", "margin", "padding", "border", "border-radius",
            "background", "background-color", "color", "font-size", "font-weight",
            "font-family", "line-height", "text-align", "flex-direction",
            "align-items", "justify-content", "gap", "overflow", "opacity",
            "box-shadow", "transform",
          ];
          for (let j = 0; j < sourceEls.length && j < cloneEls.length; j++) {
            const computed = iframeWin.getComputedStyle(sourceEls[j]);
            const el = cloneEls[j] as HTMLElement;
            if (!el?.style) continue;
            for (const prop of styleProps) {
              const val = computed.getPropertyValue(prop);
              if (val) el.style.setProperty(prop, val);
            }
          }

          const canvas = await html2canvas(wrapper, {
            width: 1280,
            height: 720,
            scale: 2,
            useCORS: true,
            backgroundColor: null,
          });
          pngs.push(canvas.toDataURL("image/png"));
          document.body.removeChild(wrapper);
        } catch {
          // Fallback: simple colored slide
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
          ctx.fillText(generatedSlides[i].title || "Slide", 640, 360);
          pngs.push(canvas.toDataURL("image/png"));
        }
        document.body.removeChild(container);
      }

      // Send PNGs to PPTX API
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
    if (generatedSlides.length === 0) return;
    setExporting(true);

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

      for (let i = 0; i < generatedSlides.length; i++) {
        const container = document.createElement("div");
        container.style.cssText =
          "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "width:1280px;height:720px;border:none;";
        container.appendChild(iframe);
        iframe.srcdoc = slideSrcDoc(generatedSlides[i].html);

        await new Promise<void>((resolve) => {
          iframe.onload = () => resolve();
        });
        await new Promise((r) => setTimeout(r, 2000));

        let png: string;
        try {
          const iframeDoc = iframe.contentDocument!;
          const iframeWin = iframe.contentWindow!;
          const sourceBody = iframeDoc.body;

          const wrapper = document.createElement("div");
          wrapper.style.cssText =
            "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
          const bodyComputed = iframeWin.getComputedStyle(sourceBody);
          wrapper.style.background = bodyComputed.background;
          wrapper.innerHTML = sourceBody.innerHTML;
          document.body.appendChild(wrapper);

          const canvas = await html2canvas(wrapper, {
            width: 1280,
            height: 720,
            scale: 2,
            useCORS: true,
            backgroundColor: null,
          });
          png = canvas.toDataURL("image/png");
          document.body.removeChild(wrapper);
        } catch {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, 1280, 720);
          png = canvas.toDataURL("image/png");
        }
        document.body.removeChild(container);

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
      setExporting(false);
    }
  }, [generatedSlides, deckTitle]);

  // ============================================================
  // Keyboard navigation
  // ============================================================

  useEffect(() => {
    if (phase !== "done" || !open) return;

    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when editing
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.contentEditable === "true"
      )
        return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, generatedSlides.length - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Escape":
          e.preventDefault();
          closePanel();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, open, generatedSlides.length, closePanel]);

  // ============================================================
  // Editing toggle
  // ============================================================

  useEffect(() => {
    if (!editing || phase !== "done") return;
    const container = slideContainerRef.current;
    if (!container) return;

    const editables = container.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, li, td, th, span",
    );
    editables.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const hasDirectText = Array.from(htmlEl.childNodes).some(
        (n) =>
          n.nodeType === Node.TEXT_NODE &&
          n.textContent &&
          n.textContent.trim().length > 0,
      );
      if (!hasDirectText) return;
      htmlEl.contentEditable = "true";
      htmlEl.style.cursor = "text";
      htmlEl.style.outline = "none";
    });

    return () => {
      editables.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.contentEditable = "false";
        htmlEl.style.cursor = "";
      });
    };
  }, [editing, phase, activeIndex]);

  // Sync edits back to generatedSlides
  const syncEdit = useCallback(() => {
    const container = slideContainerRef.current;
    if (!container || !editing) return;
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentDocument) return;

    const html = iframe.contentDocument.body.innerHTML;
    setGeneratedSlides((prev) => {
      const next = [...prev];
      if (next[activeIndex]) {
        next[activeIndex] = { ...next[activeIndex], html };
      }
      return next;
    });
    setSaved(false);
  }, [editing, activeIndex]);

  if (!open) return null;

  // ============================================================
  // Render
  // ============================================================

  const activeSlide = generatedSlides[activeIndex];

  return (
    <>
      <div className="flex h-full w-[560px] shrink-0 flex-col border-l border-border bg-background">
        {/* Header */}
        <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border px-3">
          <button
            onClick={closePanel}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="閉じる"
          >
            <XIcon className="size-4" />
          </button>

          <h2 className="flex-1 truncate text-sm font-medium">
            {deckTitle || "スライド"}
          </h2>

          {phase === "done" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFullscreen(true)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                title="全画面プレゼン"
              >
                <PlayIcon className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  if (editing) syncEdit();
                  setEditing((e) => !e);
                }}
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
                disabled={exporting}
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
                disabled={exporting}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                title="PDF エクスポート"
              >
                <FileDownIcon className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Planning phase */}
          {phase === "planning" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <Loader2Icon className="size-8 animate-spin text-primary/60" />
              <p className="text-sm text-muted-foreground">構成を生成中...</p>
            </div>
          )}

          {/* Loading from DB */}
          {phase === "loading" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <Loader2Icon className="size-8 animate-spin text-primary/60" />
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            </div>
          )}

          {/* Plan ready — show preview */}
          {phase === "plan_ready" && (
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
                  onClick={fetchPlanFromApi}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  <RefreshCwIcon className="size-3.5" />
                  やり直す
                </button>
                <button
                  onClick={startGeneration}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  生成する
                </button>
              </div>
            </div>
          )}

          {/* Generating — progress + thumbnails */}
          {phase === "generating" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2Icon className="size-4 animate-spin text-primary" />
                  <span className="text-muted-foreground">
                    スライド生成中{" "}
                    <span className="font-medium text-foreground">
                      {generatingCompleted}/{generatingTotal}
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${generatingTotal ? (generatingCompleted / generatingTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-2">
                  {slideSections.map((section, i) => {
                    const slide = generatedSlides[i];
                    return (
                      <div
                        key={i}
                        className="relative aspect-video rounded-md border border-border/60 overflow-hidden bg-muted/30"
                      >
                        {slide ? (
                          <iframe
                            srcDoc={slideSrcDoc(slide.html)}
                            className="pointer-events-none"
                            style={{
                              width: SLIDE_W,
                              height: SLIDE_H,
                              transform: `scale(${240 / SLIDE_W})`,
                              transformOrigin: "top left",
                            }}
                            tabIndex={-1}
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
                            {i === generatingCompleted ? (
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
          )}

          {/* Done — viewer */}
          {phase === "done" && activeSlide && (
            <div className="flex flex-1 flex-col overflow-hidden">
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
                    srcDoc={slideSrcDoc(activeSlide.html)}
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
                  onClick={() => setActiveIndex((i) => Math.max(i - 1, 0))}
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
                    setActiveIndex((i) =>
                      Math.min(i + 1, generatedSlides.length - 1),
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
                      onClick={() => setActiveIndex(i)}
                      className={cn(
                        "relative shrink-0 rounded border overflow-hidden transition-all",
                        i === activeIndex
                          ? "border-primary ring-1 ring-primary/30"
                          : "border-border/60 hover:border-foreground/30",
                      )}
                      style={{ width: 96, height: 54 }}
                    >
                      <iframe
                        srcDoc={slideSrcDoc(slide.html)}
                        className="pointer-events-none"
                        style={{
                          width: SLIDE_W,
                          height: SLIDE_H,
                          transform: `scale(${96 / SLIDE_W})`,
                          transformOrigin: "top left",
                        }}
                        tabIndex={-1}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error || "エラーが発生しました"}
              </div>
              <button
                onClick={fetchPlanFromApi}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <RefreshCwIcon className="size-3.5" />
                再試行
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen presenter */}
      {fullscreen && phase === "done" && (
        <FullscreenPresenter
          slides={generatedSlides.map((s) => ({
            html: slideSrcDoc(s.html),
            title: s.title,
          }))}
          initialIndex={activeIndex}
          onExit={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
