"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FullscreenPresenterProps {
  slides: { html: string; title: string }[];
  initialIndex?: number;
  onExit: () => void;
}

export function FullscreenPresenter({
  slides,
  initialIndex = 0,
  onExit,
}: FullscreenPresenterProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [showHud, setShowHud] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const total = slides.length;

  const resetHideTimer = useCallback(() => {
    setShowHud(true);
    if (containerRef.current) containerRef.current.style.cursor = "default";
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowHud(false);
      if (containerRef.current) containerRef.current.style.cursor = "none";
    }, 3000);
  }, []);

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= total || idx === current) return;
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(idx);
        setTransitioning(false);
      }, 150);
      resetHideTimer();
    },
    [current, total, resetHideTimer],
  );

  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const prev = useCallback(() => goTo(current - 1), [goTo, current]);

  // Request fullscreen on mount
  useEffect(() => {
    document.documentElement
      .requestFullscreen?.()
      .catch(() => {});
    resetHideTimer();
    return () => {
      clearTimeout(hideTimer.current);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [resetHideTimer]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onExit]);

  // Fullscreen exit detection
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFsChange);
  }, [onExit]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width / 2) next();
      else prev();
    },
    [next, prev],
  );

  const slide = slides[current];
  if (!slide) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onMouseMove={resetHideTimer}
      onClick={handleClick}
    >
      {/* Slide */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          opacity: transitioning ? 0 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
        <iframe
          srcDoc={slide.html}
          className="pointer-events-none"
          style={{
            width: 1280,
            height: 720,
            maxWidth: "100vw",
            maxHeight: "100vh",
            transform: `scale(${Math.min(window.innerWidth / 1280, window.innerHeight / 720)})`,
            transformOrigin: "center center",
          }}
          tabIndex={-1}
        />
      </div>

      {/* HUD: page counter */}
      <div
        className="fixed bottom-6 right-6 px-3 py-1.5 rounded-full bg-black/60 text-white/80 text-sm font-medium backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: showHud ? 1 : 0 }}
      >
        {current + 1} / {total}
      </div>
    </div>,
    document.body,
  );
}
