"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  resolveThemeVars,
  getWidgetIframeStyleBlock,
} from "@/lib/widget-css-bridge";
import {
  sanitizeForStreaming,
  sanitizeForIframe,
  buildReceiverSrcdoc,
} from "@/lib/widget-sanitizer";
import { WidgetShimmer } from "./widget-shimmer";
import { WidgetErrorBoundary } from "./widget-error-boundary";

interface WidgetRendererProps {
  /** Raw HTML to render inside the widget iframe. */
  widgetCode: string;
  /** True while the fence is still being streamed. */
  isStreaming: boolean;
  /** Optional title displayed above the widget. */
  title?: string;
  /** Show shimmer overlay (e.g. while scripts are being streamed). */
  showOverlay?: boolean;
}

const MAX_IFRAME_HEIGHT = 2000;
const CDN_PATTERN =
  /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|esm\.sh/;

/** Module-level height cache: survives component remounts. */
const _heightCache = new Map<string, number>();
function cacheKey(code: string): string {
  return code.slice(0, 200);
}

export function WidgetRenderer(props: WidgetRendererProps) {
  return (
    <WidgetErrorBoundary>
      <WidgetRendererInner {...props} />
    </WidgetErrorBoundary>
  );
}

function WidgetRendererInner({
  widgetCode,
  isStreaming,
  title,
  showOverlay,
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rafRef = useRef(0);
  const lastSentRef = useRef("");
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(
    () => _heightCache.get(cacheKey(widgetCode)) || 0,
  );
  const [showCode, setShowCode] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const finalizedRef = useRef(false);
  const hasFirstHeight = useRef(
    (_heightCache.get(cacheKey(widgetCode)) || 0) > 0,
  );
  const heightLockedRef = useRef(false);

  const hasCDN = useMemo(() => CDN_PATTERN.test(widgetCode), [widgetCode]);

  // Build receiver srcdoc once
  const srcdoc = useMemo(() => {
    if (typeof document === "undefined") return "";
    const isDark = document.documentElement.classList.contains("dark");
    const vars = resolveThemeVars();
    const style = getWidgetIframeStyleBlock(vars);
    return buildReceiverSrcdoc(style, isDark);
  }, []);

  // ── postMessage handler ────────────────────────────────────────────────
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow)
        return;

      switch (e.data.type) {
        case "widget:ready":
          setIframeReady(true);
          break;

        case "widget:resize": {
          if (typeof e.data.height !== "number" || e.data.height <= 0) break;
          const newH = Math.min(e.data.height + 2, MAX_IFRAME_HEIGHT);
          const key = cacheKey(widgetCode);

          if (heightLockedRef.current) {
            setIframeHeight((prev) => {
              const h = Math.max(prev, newH);
              _heightCache.set(key, h);
              return h;
            });
            break;
          }

          _heightCache.set(key, newH);
          if (!hasFirstHeight.current) {
            hasFirstHeight.current = true;
            const el = iframeRef.current;
            if (el) {
              el.style.transition = "none";
              void el.offsetHeight;
            }
            setIframeHeight(newH);
            requestAnimationFrame(() => {
              if (el) el.style.transition = "height 0.3s ease-out";
            });
          } else {
            setIframeHeight(newH);
          }
          break;
        }

        case "widget:link": {
          const href = String(e.data.href || "");
          if (href && !/^\s*(javascript|data)\s*:/i.test(href)) {
            window.open(href, "_blank", "noopener,noreferrer");
          }
          break;
        }
      }
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [widgetCode]);

  // ── Streaming updates ──────────────────────────────────────────────────
  const sendUpdate = useCallback((html: string) => {
    if (finalizedRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (html === lastSentRef.current) return;
    lastSentRef.current = html;
    iframe.contentWindow.postMessage({ type: "widget:update", html }, "*");
  }, []);

  // Send updates on each animation frame for smooth progressive rendering.
  // With morphdom in the iframe, DOM diffing is cheap (~0.1ms), so 60fps
  // updates are fine. Each frame shows the latest HTML — text fills in
  // nearly character-by-character instead of in 120ms chunks.
  useEffect(() => {
    if (!isStreaming || !iframeReady) return;
    rafRef.current = requestAnimationFrame(() => {
      sendUpdate(sanitizeForStreaming(widgetCode));
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [widgetCode, isStreaming, iframeReady, sendUpdate]);

  // ── Finalize ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isStreaming || !iframeReady || finalizedRef.current) return;
    const sanitized = sanitizeForIframe(widgetCode);
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    // Cancel any pending streaming RAF
    cancelAnimationFrame(rafRef.current);
    finalizedRef.current = true;
    lastSentRef.current = sanitized;
    heightLockedRef.current = true;
    iframe.contentWindow.postMessage(
      { type: "widget:finalize", html: sanitized },
      "*",
    );
    setTimeout(() => {
      heightLockedRef.current = false;
      setFinalized(true);
      // Re-measure after lock releases in case content shrank during finalize
      iframe.contentWindow?.postMessage({ type: "widget:measure" }, "*");
    }, 400);
  }, [isStreaming, iframeReady, widgetCode]);

  // ── Theme sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!iframeReady) return;
    const observer = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains("dark");
      const vars = resolveThemeVars();
      iframeRef.current?.contentWindow?.postMessage(
        { type: "widget:theme", vars, isDark: nowDark },
        "*",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [iframeReady]);

  const showCdnOverlay = hasCDN && !isStreaming && iframeReady && !finalized;

  return (
    <div
      className="group/widget relative my-2 w-full overflow-hidden"
      style={{ minWidth: "min(100%, 600px)" }}
    >
      {title && (
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {title.replace(/_/g, " ")}
        </div>
      )}

      <div
        className="overflow-hidden transition-[height] duration-300 ease-out"
        style={{ height: showCode ? 0 : (iframeHeight || "auto") }}
      >
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || "Widget"}
          onLoad={() => setIframeReady(true)}
          style={{
            width: "100%",
            height: iframeHeight || 200,
            border: "none",
            display: showCode ? "none" : "block",
            overflow: "hidden",
            colorScheme: "auto",
            borderRadius: "var(--radius)",
          }}
        />
      </div>

      {(showCdnOverlay || showOverlay) && <WidgetShimmer />}

      {showCode && (
        <pre className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-border/30 bg-muted/30 p-3 text-xs">
          <code>{widgetCode}</code>
        </pre>
      )}

      <button
        onClick={() => setShowCode(!showCode)}
        className="absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted/50 hover:text-muted-foreground group-hover/widget:opacity-100"
      >
        {showCode ? "Hide Code" : "Show Code"}
      </button>
    </div>
  );
}
