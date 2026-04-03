import { useCallback, useEffect, useRef, useState } from "react";
import {
  setupDragHandles,
  cleanupDragHandles,
  applyDragTranslate,
} from "./utils";
import type { GeneratedSlide, SlideSection, Phase } from "./types";

interface UseSlideEditingParams {
  phase: Phase;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  generatedSlides: GeneratedSlide[];
  setGeneratedSlides: React.Dispatch<React.SetStateAction<GeneratedSlide[]>>;
  slideSections: SlideSection[];
  deckTitle: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  scaleRef: React.MutableRefObject<number>;
  setError: (e: string | null) => void;
  setSaved: (s: boolean) => void;
}

export function useSlideEditing({
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
}: UseSlideEditingParams) {
  const [editing, setEditing] = useState(false);
  const [redrawing, setRedrawing] = useState(false);
  const editFontRef = useRef("Noto Sans JP, Hiragino Sans, sans-serif");
  const lastFocusedEditableRef = useRef<HTMLElement | null>(null);

  // ============================================================
  // Editing setup: contentEditable + drag/resize on iframe
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

      // Attach listeners
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
      const poll = setInterval(() => {
        const currentIframe = iframeRef.current;
        if (!currentIframe) return;
        try {
          if (currentIframe.contentDocument?.readyState === "complete") {
            clearInterval(poll);
            if (!cleanup) cleanup = initEditing();
          }
        } catch {
          /* cross-origin */
        }
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
  }, [editing, activeIndex, phase, iframeRef, scaleRef]);

  // ============================================================
  // Persist / font / fontSize / redraw callbacks
  // ============================================================

  const persistCurrentSlide = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const container = iframe.contentDocument.body;

    container.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      (el as HTMLElement).removeAttribute("contenteditable");
      (el as HTMLElement).style.cursor = "";
      (el as HTMLElement).style.outline = "none";
    });

    cleanupDragHandles(container);

    const updatedHtml = container.innerHTML;

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
  }, [activeIndex, iframeRef, setGeneratedSlides, setSaved]);

  const applyGlobalFont = useCallback(
    (cssFont: string) => {
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
    },
    [iframeRef],
  );

  const adjustFocusedFontSize = useCallback(
    (delta: number) => {
      const target = lastFocusedEditableRef.current;
      const iframe = iframeRef.current;
      if (!target || !iframe?.contentWindow) return;
      if (!iframe.contentDocument?.body.contains(target)) return;
      const computed = iframe.contentWindow.getComputedStyle(target);
      const current = parseFloat(computed.fontSize) || 16;
      const next = Math.max(8, Math.min(120, current + delta));
      target.style.fontSize = `${next}px`;
    },
    [iframeRef],
  );

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
    setGeneratedSlides,
    setError,
  ]);

  const handleToggleEditing = useCallback(() => {
    if (editing) {
      persistCurrentSlide();
      setEditing(false);
    } else {
      setEditing(true);
    }
  }, [editing, persistCurrentSlide]);

  const handleSlideChange = useCallback(
    (newIndex: number) => {
      if (editing) persistCurrentSlide();
      setActiveIndex(newIndex);
    },
    [editing, persistCurrentSlide, setActiveIndex],
  );

  return {
    editing,
    setEditing,
    redrawing,
    persistCurrentSlide,
    applyGlobalFont,
    adjustFocusedFontSize,
    redrawCurrentSlide,
    handleToggleEditing,
    handleSlideChange,
  };
}
