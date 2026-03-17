"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { resolveThemeVars, getWidgetIframeStyleBlock } from "@/lib/widget-css-bridge";
import {
  sanitizeForStreaming,
  sanitizeForIframe,
  buildReceiverSrcdoc,
} from "@/lib/widget-sanitizer";
import {
  parseWidgetContent,
  stripIncompleteScript,
} from "@/lib/widget-parser";
import { WidgetShimmer } from "./widget-shimmer";

/**
 * Props from streamdown CustomRenderer API.
 */
interface CustomRendererProps {
  code: string;
  isIncomplete: boolean;
  language: string;
}

/** Max iframe height to prevent runaway widgets. */
const MAX_IFRAME_HEIGHT = 2000;

/** Debounce delay for streaming updates (ms). */
const STREAM_DEBOUNCE = 120;

/** CDN hosts that indicate a complex widget needing load time. */
const CDN_PATTERN =
  /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|esm\.sh/;

/**
 * Module-level height cache: preserves widget heights across component remounts.
 * Keyed by first 200 chars of code (stable across streaming→persisted).
 */
const _heightCache = new Map<string, number>();
function getHeightCacheKey(code: string): string {
  return code.slice(0, 200);
}

export function WidgetRenderer({ code, isIncomplete }: CustomRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>("");
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(() => {
    return _heightCache.get(getHeightCacheKey(code)) || 0;
  });
  const [showCode, setShowCode] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const finalizedRef = useRef(false);
  const hasReceivedFirstHeight = useRef(
    (_heightCache.get(getHeightCacheKey(code)) || 0) > 0,
  );
  const heightLockedRef = useRef(false);

  // Parse widget content
  const parsed = useMemo(
    () => parseWidgetContent(code, isIncomplete),
    [code, isIncomplete],
  );

  // Detect CDN scripts for overlay
  const hasCDN = useMemo(
    () => CDN_PATTERN.test(parsed.widgetHtml ?? ""),
    [parsed.widgetHtml],
  );

  // Build receiver srcdoc once
  const srcdoc = useMemo(() => {
    if (typeof document === "undefined") return "";
    const isDark = document.documentElement.classList.contains("dark");
    const resolvedVars = resolveThemeVars();
    const styleBlock = getWidgetIframeStyleBlock(resolvedVars);
    return buildReceiverSrcdoc(styleBlock, isDark);
  }, []);

  // ── postMessage handler ────────────────────────────────────────────────
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;
      if (
        iframeRef.current &&
        e.source !== iframeRef.current.contentWindow
      )
        return;

      switch (e.data.type) {
        case "widget:ready":
          setIframeReady(true);
          break;

        case "widget:resize":
          if (typeof e.data.height === "number" && e.data.height > 0) {
            const newH = Math.min(e.data.height + 2, MAX_IFRAME_HEIGHT);
            const cacheKey = getHeightCacheKey(code);
            if (heightLockedRef.current) {
              setIframeHeight((prev) => {
                const h = Math.max(prev, newH);
                _heightCache.set(cacheKey, h);
                return h;
              });
              break;
            }
            _heightCache.set(cacheKey, newH);
            if (!hasReceivedFirstHeight.current) {
              hasReceivedFirstHeight.current = true;
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
          }
          break;

        case "widget:link": {
          const href = String(e.data.href || "");
          if (href && !/^\s*(javascript|data)\s*:/i.test(href)) {
            window.open(href, "_blank", "noopener,noreferrer");
          }
          break;
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [code]);

  // ── Streaming updates ──────────────────────────────────────────────────
  const sendUpdate = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (html === lastSentRef.current) return;
    lastSentRef.current = html;
    iframe.contentWindow.postMessage({ type: "widget:update", html }, "*");
  }, []);

  useEffect(() => {
    if (!isIncomplete || !iframeReady || !parsed.widgetHtml) return;
    // Strip incomplete scripts and sanitize for streaming preview
    let html = parsed.widgetHtml;
    if (parsed.scriptsTruncated) {
      html = stripIncompleteScript(html);
    }
    const sanitized = sanitizeForStreaming(html);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => sendUpdate(sanitized),
      STREAM_DEBOUNCE,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [parsed.widgetHtml, parsed.scriptsTruncated, isIncomplete, iframeReady, sendUpdate]);

  // ── Finalize ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isIncomplete || !iframeReady || finalizedRef.current) return;
    if (!parsed.widgetHtml) return;
    const sanitized = sanitizeForIframe(parsed.widgetHtml);
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
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
    }, 400);
  }, [isIncomplete, iframeReady, parsed.widgetHtml]);

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

  // Show shimmer for CDN-dependent widgets while scripts are loading
  const showLoadingOverlay = hasCDN && !isIncomplete && iframeReady && !finalized;
  // Show shimmer during streaming when scripts are still being generated
  const showStreamingOverlay = isIncomplete && parsed.scriptsTruncated;

  // No widget content yet — show placeholder
  if (!parsed.widgetHtml && isIncomplete) {
    return (
      <div className="widget-container relative my-2 rounded-lg border border-border/50 bg-muted/30">
        <div className="widget-loading-placeholder">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {parsed.title && (
              <span className="font-medium">{parsed.title}</span>
            )}
            <span className="animate-soft-pulse">Widget を生成中...</span>
          </div>
        </div>
        <WidgetShimmer />
      </div>
    );
  }

  if (!parsed.widgetHtml) return null;

  return (
    <div className="group/widget relative my-2">
      {/* Title bar */}
      {parsed.title && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium">{parsed.title.replace(/_/g, " ")}</span>
        </div>
      )}

      {/* iframe — always visible */}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title={parsed.title || "Widget"}
        onLoad={() => setIframeReady(true)}
        style={{
          width: "100%",
          height: iframeHeight,
          border: "none",
          display: showCode ? "none" : "block",
          overflow: "hidden",
          colorScheme: "auto",
          borderRadius: "var(--radius)",
        }}
      />

      {/* Shimmer overlay */}
      {(showLoadingOverlay || showStreamingOverlay) && <WidgetShimmer />}

      {/* Code view toggle */}
      {showCode && (
        <pre className="rounded-lg border border-border/30 bg-muted/30 p-3 text-xs overflow-x-auto max-h-80 overflow-y-auto">
          <code>{parsed.widgetHtml}</code>
        </pre>
      )}

      <button
        onClick={() => setShowCode(!showCode)}
        className="absolute top-1 right-1 opacity-0 group-hover/widget:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
      >
        {showCode ? "Hide Code" : "Show Code"}
      </button>
    </div>
  );
}
