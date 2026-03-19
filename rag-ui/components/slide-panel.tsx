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
  RefreshCwIcon,
  FileDownIcon,
  SquareIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

// ============================================================
// Constants
// ============================================================

const SLIDE_W = 1280;
const SLIDE_H = 720;
const PLAN_TIMEOUT_MS = 60_000;
const RENDER_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;

// Font family presets
const FONT_PRESETS = [
  { label: "ゴシック体", css: "Noto Sans JP, Hiragino Sans, sans-serif" },
  { label: "明朝体", css: "Noto Serif JP, Hiragino Mincho ProN, serif" },
  { label: "丸ゴシック", css: "Rounded Mplus 1c, Noto Sans JP, sans-serif" },
  { label: "モノスペース", css: "Source Code Pro, Noto Sans Mono, monospace" },
] as const;

// Drag-to-move + Resize CSS
const DRAG_CSS = `
[data-draggable] { overflow:visible !important; }
[data-draggable][data-hovered] > [data-drag-toolbar] { opacity:1 !important }
[data-draggable][data-hovered] > [data-resize] { opacity:1 !important }
[data-draggable][data-selected] { outline:2px solid rgba(59,130,246,0.6) !important; outline-offset:2px !important; }
[data-drag-toolbar] {
  position:absolute; top:-6px; left:-6px; z-index:100;
  display:flex; align-items:center; gap:2px;
  opacity:0; transition:opacity .15s; pointer-events:auto;
}
[data-drag-toolbar] > [data-drag-handle] {
  width:22px; height:22px;
  background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.12);
  border-radius:5px; display:flex; align-items:center; justify-content:center;
  cursor:grab; box-shadow:0 1px 3px rgba(0,0,0,0.1);
}
[data-drag-handle]:active { cursor:grabbing }
[data-drag-toolbar] > [data-block-action] {
  width:20px; height:20px;
  background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.10);
  border-radius:4px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.08);
  transition:background .1s;
}
[data-block-action]:hover { background:rgba(230,230,230,0.95) !important }
[data-block-action="delete"]:hover { background:rgba(254,202,202,0.95) !important }
[data-dragging] {
  outline:2px dashed rgba(20,184,166,0.5) !important;
  outline-offset:2px !important; opacity:0.85;
}
[data-resize] {
  position:absolute; background:white; border:1.5px solid rgba(20,184,166,0.7);
  border-radius:2px; z-index:101; opacity:0; transition:opacity .15s; pointer-events:auto;
  box-shadow:0 0 2px rgba(0,0,0,0.1);
}
[data-resize="se"],[data-resize="nw"],[data-resize="ne"],[data-resize="sw"] { width:8px; height:8px; }
[data-resize="se"] { bottom:-4px; right:-4px; cursor:se-resize; }
[data-resize="sw"] { bottom:-4px; left:-4px; cursor:sw-resize; }
[data-resize="ne"] { top:-4px; right:-4px; cursor:ne-resize; }
[data-resize="nw"] { top:-4px; left:-4px; cursor:nw-resize; }
[data-resize="e"],[data-resize="w"] { width:6px; height:20px; top:50%; margin-top:-10px; }
[data-resize="n"],[data-resize="s"] { height:6px; width:20px; left:50%; margin-left:-10px; }
[data-resize="e"] { right:-3px; cursor:e-resize; }
[data-resize="w"] { left:-3px; cursor:w-resize; }
[data-resize="n"] { top:-3px; cursor:n-resize; }
[data-resize="s"] { bottom:-3px; cursor:s-resize; }
[data-resizing] {
  outline:2px solid rgba(20,184,166,0.6) !important;
  outline-offset:1px !important;
}`;

const GRIP_SVG = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="4" cy="7" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="7" r="1.5" fill="#9CA3AF"/><circle cx="4" cy="11" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="11" r="1.5" fill="#9CA3AF"/></svg>`;
const COPY_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const TRASH_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

// ============================================================
// Drag helpers (module-level)
// ============================================================

const SKIP_TAGS = new Set(["script", "style", "br", "hr"]);
const LEAF_TAGS = new Set(["table", "svg", "img", "canvas", "video", "iframe"]);

function findDraggableBlocks(container: HTMLElement): HTMLElement[] {
  let root: HTMLElement | null = null;
  for (const child of Array.from(container.children) as HTMLElement[]) {
    const tag = child.tagName.toLowerCase();
    if (
      tag === "style" ||
      child.hasAttribute("data-drag-toolbar") ||
      child.hasAttribute("data-resize")
    )
      continue;
    root = child;
    break;
  }
  if (!root) return [];

  const results: HTMLElement[] = [];
  const isInjected = (el: Element) =>
    el.hasAttribute("data-drag-toolbar") || el.hasAttribute("data-resize");
  const significantChildren = (parent: HTMLElement): HTMLElement[] =>
    (Array.from(parent.children) as HTMLElement[]).filter((c) => {
      if (isInjected(c)) return false;
      const t = c.tagName.toLowerCase();
      if (SKIP_TAGS.has(t)) return false;
      return c.offsetHeight >= 20 && c.offsetWidth >= 40;
    });

  const collect = (parent: HTMLElement, depth: number) => {
    if (depth > 6) return;
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      if (isInjected(child)) continue;
      if (child.offsetHeight < 20 || child.offsetWidth < 40) continue;
      if (LEAF_TAGS.has(tag)) {
        results.push(child);
        continue;
      }
      const sigKids = significantChildren(child);
      const isLarge = child.offsetWidth > 640 || child.offsetHeight > 360;
      results.push(child);
      if (
        depth < 6 &&
        (sigKids.length >= 2 || (isLarge && sigKids.length >= 1))
      ) {
        collect(child, depth + 1);
      }
    }
  };

  collect(root, 0);
  return results;
}

function applyDragTranslate(el: HTMLElement, dx: number, dy: number) {
  const prevDx = parseFloat(el.dataset.dragX || "0");
  const prevDy = parseFloat(el.dataset.dragY || "0");
  const newDx = prevDx + dx;
  const newDy = prevDy + dy;
  el.dataset.dragX = String(newDx);
  el.dataset.dragY = String(newDy);
  if (!el.dataset.dragOrigTransform) {
    el.dataset.dragOrigTransform = el.style.transform || "";
  }
  const orig = el.dataset.dragOrigTransform;
  el.style.transform = orig
    ? `translate(${newDx}px,${newDy}px) ${orig}`
    : `translate(${newDx}px,${newDy}px)`;
}

function setupDragHandles(container: HTMLElement) {
  const doc = container.ownerDocument;
  const styleId = "__drag-styles";
  if (!container.querySelector(`#${styleId}`)) {
    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent = DRAG_CSS;
    container.prepend(style);
  }

  const blocks = findDraggableBlocks(container);
  for (const el of blocks) {
    if (el.hasAttribute("data-draggable")) continue;
    el.setAttribute("data-draggable", "");
    const cs = (container.ownerDocument.defaultView || window).getComputedStyle(
      el,
    );
    if (cs.position === "static") {
      el.style.position = "relative";
      el.setAttribute("data-drag-pos", "");
    }

    const toolbar = doc.createElement("div");
    toolbar.setAttribute("data-drag-toolbar", "");
    toolbar.style.position = "absolute";

    const grip = doc.createElement("div");
    grip.setAttribute("data-drag-handle", "");
    grip.innerHTML = GRIP_SVG;
    const copyBtn = doc.createElement("div");
    copyBtn.setAttribute("data-block-action", "copy");
    copyBtn.title = "コピー";
    copyBtn.innerHTML = COPY_SVG;
    const delBtn = doc.createElement("div");
    delBtn.setAttribute("data-block-action", "delete");
    delBtn.title = "削除";
    delBtn.innerHTML = TRASH_SVG;

    toolbar.append(grip, copyBtn, delBtn);
    el.prepend(toolbar);

    for (const dir of ["nw", "ne", "sw", "se", "n", "s", "e", "w"]) {
      const rh = doc.createElement("div");
      rh.setAttribute("data-resize", dir);
      el.appendChild(rh);
    }
  }
}

function cleanupDragHandles(container: HTMLElement) {
  container
    .querySelectorAll("[data-drag-toolbar]")
    .forEach((el) => el.remove());
  container.querySelectorAll("[data-resize]").forEach((el) => el.remove());
  container.querySelectorAll("[data-draggable]").forEach((el) => {
    el.removeAttribute("data-draggable");
    el.removeAttribute("data-dragging");
    el.removeAttribute("data-resizing");
    el.removeAttribute("data-hovered");
    el.removeAttribute("data-selected");
    (el as HTMLElement).removeAttribute("data-resize-orig-w");
    (el as HTMLElement).removeAttribute("data-resize-orig-h");
    (el as HTMLElement).removeAttribute("data-resize-temp-dx");
    (el as HTMLElement).removeAttribute("data-resize-temp-dy");
  });
  container.querySelectorAll("[data-drag-pos]").forEach((el) => {
    (el as HTMLElement).style.position = "";
    el.removeAttribute("data-drag-pos");
  });
  const dragStyle = container.querySelector("#__drag-styles");
  if (dragStyle) dragStyle.remove();
}

const SLIDE_CDN_HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;700&family=M+PLUS+Rounded+1c:wght@400;700&family=Source+Code+Pro:wght@400;600&display=swap" rel="stylesheet">
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

function failedSlideHtml(title: string, errorMsg: string) {
  return `<div style="width:1280px;height:720px;display:flex;align-items:center;justify-content:center;background:#1e293b;color:#94a3b8;font-family:'Noto Sans JP',sans-serif;flex-direction:column;gap:16px;">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
<p style="font-size:20px;color:#e2e8f0;margin:0;">${title}</p>
<p style="font-size:14px;color:#64748b;margin:0;max-width:600px;text-align:center;">${errorMsg}</p>
</div>`;
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
  failed?: boolean;
};

type Phase =
  | "planning"
  | "plan_ready"
  | "generating"
  | "done"
  | "error"
  | "loading";

// ============================================================
// fetchWithRetry — exponential backoff for 429/503
// ============================================================

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Combine user abort signal with timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const userSignal = options.signal;

    // If user already aborted, throw immediately
    if (userSignal?.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }

    // Listen for user abort to also abort timeout controller
    const onUserAbort = () => timeoutController.abort();
    userSignal?.addEventListener("abort", onUserAbort, { once: true });

    try {
      const res = await fetch(url, {
        ...options,
        signal: timeoutController.signal,
      });

      clearTimeout(timeoutId);
      userSignal?.removeEventListener("abort", onUserAbort);

      // Retry on rate limit or server overload
      if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        console.warn(
          `[slide-panel] ${res.status} on ${url}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      userSignal?.removeEventListener("abort", onUserAbort);

      // User abort — don't retry
      if (userSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // Timeout — treat as retryable on first attempts
      if (
        e instanceof DOMException &&
        e.name === "AbortError" &&
        attempt < MAX_RETRIES
      ) {
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        console.warn(
          `[slide-panel] timeout on ${url}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw e;
    }
  }

  throw new Error("Max retries exceeded");
}

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
  const {
    open,
    question,
    answer,
    instructions,
    styleOptions,
    deckId,
    closePanel,
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
  const [, setGeneratingCompleted] = useState(0);

  // Viewer
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);

  // DB save
  const [currentDeckId, setCurrentDeckId] = useState<number | null>(deckId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

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

  const failedCount = generatedSlides.filter((s) => s.failed).length;

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

    if (deckId) {
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
      prevDataRef.current = { question, answer };
      fetchPlanFromApi();
    }
  }, [open, deckId, question, answer]);

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
    ) => {
      if (sections.length === 0) return;

      setPhase("generating");
      setError(null);

      // If retrying failed slides, keep existing successful ones
      const slides: GeneratedSlide[] = existingSlides
        ? [...existingSlides]
        : [];
      const startCount = slides.filter((s) => !s.failed).length;
      setGeneratedSlides([...slides]);
      setGeneratingCompleted(startCount);
      setGeneratingTotal(sections.length);

      const controller = new AbortController();
      abortRef.current = controller;

      let newFailCount = 0;

      try {
        // Build list of slides that need generating
        const toGenerate = sections
          .map((section, i) => ({ section, i }))
          .filter(({ i }) => !slides[i] || slides[i].failed);

        // Concurrent generation with concurrency limit
        const CONCURRENCY = 3;
        let completed = startCount;

        const generateOne = async ({ section, i }: { section: SlideSection; i: number }) => {
          if (controller.signal.aborted) return;
          try {
            const res = await fetchWithRetry(
              "/api/slides/htmlslide/render",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slide_plan_section: section.plan_text,
                  slide_title: section.title,
                  slide_index: i,
                  total_slides: sections.length,
                  deck_title: title,
                  slide_type: section.type,
                }),
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
                /* ignore */
              }
              throw new Error(detail);
            }

            const data = await res.json();
            slides[i] = {
              index: i,
              title: section.title,
              html: data.html || "",
              type: section.type,
            };
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            const errMsg = e instanceof Error ? e.message : "Generation failed";
            console.error(`[slide-panel] Slide ${i + 1} failed:`, errMsg);
            slides[i] = {
              index: i,
              title: section.title,
              html: failedSlideHtml(section.title, errMsg),
              type: section.type,
              failed: true,
            };
            newFailCount++;
          }
          completed++;
          setGeneratedSlides([...slides]);
          setGeneratingCompleted(completed);
        };

        // Run with concurrency limit
        const running: Promise<void>[] = [];
        for (const item of toGenerate) {
          if (controller.signal.aborted) break;
          const p = generateOne(item);
          running.push(p);
          if (running.length >= CONCURRENCY) {
            await Promise.race(running);
            // Remove settled promises
            for (let j = running.length - 1; j >= 0; j--) {
              const status = await Promise.race([running[j].then(() => "done"), Promise.resolve("pending")]);
              if (status === "done") running.splice(j, 1);
            }
          }
        }
        await Promise.all(running);

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
    renderSlides(slideSections, deckTitle);
  }, [slideSections, deckTitle, renderSlides]);

  // Retry only failed slides
  const retryFailed = useCallback(() => {
    renderSlides(slideSections, deckTitle, generatedSlides);
  }, [slideSections, deckTitle, generatedSlides, renderSlides]);

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

  const handleExport = useCallback(async () => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;
    setExporting(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const pngs: string[] = [];

      for (let i = 0; i < validSlides.length; i++) {
        const container = document.createElement("div");
        container.style.cssText =
          "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "width:1280px;height:720px;border:none;";
        container.appendChild(iframe);
        iframe.srcdoc = slideSrcDoc(validSlides[i].html);

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
            "display",
            "position",
            "top",
            "right",
            "bottom",
            "left",
            "width",
            "height",
            "margin",
            "padding",
            "border",
            "border-radius",
            "background",
            "background-color",
            "color",
            "font-size",
            "font-weight",
            "font-family",
            "line-height",
            "text-align",
            "flex-direction",
            "align-items",
            "justify-content",
            "gap",
            "overflow",
            "opacity",
            "box-shadow",
            "transform",
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
          ctx.fillText(validSlides[i].title || "Slide", 640, 360);
          pngs.push(canvas.toDataURL("image/png"));
        }
        document.body.removeChild(container);
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

      for (let i = 0; i < validSlides.length; i++) {
        const container = document.createElement("div");
        container.style.cssText =
          "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
        document.body.appendChild(container);

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "width:1280px;height:720px;border:none;";
        container.appendChild(iframe);
        iframe.srcdoc = slideSrcDoc(validSlides[i].html);

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

    tryInit();
    if (!cleanup) {
      iframe.addEventListener("load", onLoad, { once: true });
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

  const activeSlide = generatedSlides[activeIndex];
  const isWorking = phase === "planning" || phase === "generating";

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

      {phase === "done" && !editing && (
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
  );

  // Shared content body
  const contentBody = (
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
                  {generatedSlides.length}/{generatingTotal}
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${generatingTotal ? (generatedSlides.length / generatingTotal) * 100 : 0}%`,
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
                    className={cn(
                      "relative aspect-video rounded-md border overflow-hidden bg-muted/30",
                      slide?.failed
                        ? "border-amber-500/40"
                        : "border-border/60",
                    )}
                  >
                    {slide ? (
                      <>
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
                        {slide.failed && (
                          <div className="absolute top-1 right-1">
                            <AlertTriangleIcon className="size-3.5 text-amber-500" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
                        {i === generatedSlides.filter((s) => s).length ? (
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
          {/* Error banner (partial failure) */}
          {error && (
            <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="size-3.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
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
              onClick={() => handleSlideChange(Math.max(activeIndex - 1, 0))}
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
                handleSlideChange(
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
                  onClick={() => handleSlideChange(i)}
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
      )}

      {/* Error (full failure) */}
      {phase === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive max-w-full">
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
