"use client";

import { useArtifactStore } from "@/lib/artifact-store";
import type { ArtifactListItem } from "@/lib/artifact-store";
import { WidgetRenderer } from "@/components/widget-renderer";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code as codePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  Globe,
  FileType,
  Download,
  Copy,
  Check,
  Files,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState, useRef, useEffect } from "react";

const math = createMathPlugin();
const markdownPlugins = { cjk, code: codePlugin, math };

const KIND_ICONS: Record<string, typeof Code> = {
  html: Globe,
  code: Code,
  text: FileText,
  markdown: FileType,
};

const KIND_EXTENSIONS: Record<string, string> = {
  html: ".html",
  code: ".txt",
  text: ".txt",
  markdown: ".md",
};

const LANG_EXTENSIONS: Record<string, string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  rust: "rs",
  ruby: "rb",
  golang: "go",
  go: "go",
};

const MIN_WIDTH = 400;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 640;

function ArtifactListDropdown({
  items,
  currentId,
  onSelect,
  onClose,
}: {
  items: ArtifactListItem[];
  currentId: string | null;
  onSelect: (item: ArtifactListItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-border/50 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        生成ファイル
      </div>
      {items.map((item) => {
        const Icon = KIND_ICONS[item.kind] ?? FileText;
        const isActive = item.id === currentId;
        return (
          <button
            key={item.id}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "hover:bg-accent text-foreground"
            }`}
            onClick={() => {
              onSelect(item);
              onClose();
            }}
          >
            <Icon className={`size-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
            <span className="truncate">{item.title || "無題"}</span>
            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/50">
              v{item.currentVersion}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PanelContent({
  kind,
  language,
  content,
  isStreaming,
}: {
  kind: string;
  language: string;
  content: string;
  isStreaming: boolean;
}) {
  if (kind === "html") {
    return <WidgetRenderer widgetCode={content} isStreaming={isStreaming} />;
  }
  if (kind === "code") {
    const lang = language || "text";
    const fenced = `\`\`\`${lang}\n${content}\n\`\`\``;
    return (
      <div className="p-4 [&_pre]:!m-0 [&_pre]:!rounded-none">
        <Streamdown plugins={markdownPlugins}>{fenced}</Streamdown>
      </div>
    );
  }
  if (kind === "markdown" || kind === "text") {
    return (
      <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
        <Streamdown plugins={markdownPlugins}>{content}</Streamdown>
      </div>
    );
  }
  return (
    <div className="p-6 text-sm whitespace-pre-wrap leading-relaxed">
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize handle — draggable left edge
// ---------------------------------------------------------------------------

function ResizeHandle({
  onResize,
}: {
  onResize: (deltaX: number) => void;
}) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = lastX.current - e.clientX;
      lastX.current = e.clientX;
      onResize(delta);
    },
    [onResize],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-20 flex w-3 cursor-col-resize items-center justify-center group/handle hover:bg-primary/5 active:bg-primary/10 transition-colors touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="h-8 w-[3px] rounded-full bg-border/40 group-hover/handle:bg-primary/40 group-active/handle:bg-primary/60 transition-colors" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArtifactPanel
// ---------------------------------------------------------------------------

export function ArtifactPanel() {
  const {
    id,
    title,
    kind,
    language,
    content,
    version,
    versions,
    isStreaming,
    artifactList,
    closeArtifact,
    setVersion,
    openArtifact,
  } = useArtifactStore();

  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const maxVersion =
    versions.length > 0 ? versions[versions.length - 1].version : version;

  const handleResize = useCallback((deltaX: number) => {
    setPanelWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + deltaX)));
  }, []);

  const handlePrevVersion = useCallback(async () => {
    if (!id || version <= 1) return;
    const prev = version - 1;
    try {
      const res = await fetch(`/api/artifacts/${id}/versions/${prev}`);
      if (res.ok) {
        const data = await res.json();
        setVersion(prev, data.content);
      }
    } catch (e) {
      console.error("[ArtifactPanel] version fetch failed:", e);
    }
  }, [id, version, setVersion]);

  const handleNextVersion = useCallback(async () => {
    if (!id || version >= maxVersion) return;
    const next = version + 1;
    try {
      const res = await fetch(`/api/artifacts/${id}/versions/${next}`);
      if (res.ok) {
        const data = await res.json();
        setVersion(next, data.content);
      }
    } catch (e) {
      console.error("[ArtifactPanel] version fetch failed:", e);
    }
  }, [id, version, maxVersion, setVersion]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDownload = useCallback(() => {
    const ext =
      kind === "code" && language
        ? `.${LANG_EXTENSIONS[language] ?? language}`
        : (KIND_EXTENSIONS[kind] ?? ".txt");
    const mime =
      kind === "html"
        ? "text/html"
        : kind === "markdown"
          ? "text/markdown"
          : "text/plain";
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "artifact"}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, kind, language, title]);

  const handleSelectArtifact = useCallback(
    async (item: ArtifactListItem) => {
      if (item.id === id) return;
      try {
        const res = await fetch(`/api/artifacts/${item.id}`);
        if (res.ok) {
          const data = await res.json();
          openArtifact({
            id: data.id,
            title: data.title,
            kind: data.kind,
            content: data.content ?? "",
            version: data.currentVersion,
            versions: data.versions,
          });
        }
      } catch (e) {
        console.error("[ArtifactPanel] artifact fetch failed:", e);
      }
    },
    [id, openArtifact],
  );

  const KindIcon = KIND_ICONS[kind] ?? FileText;

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-border/50 bg-background"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <ResizeHandle onResize={handleResize} />

      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-border/40 px-4 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0 pl-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <KindIcon className="size-3.5 text-primary" />
          </div>
          <span className="truncate text-sm font-medium">{title}</span>
          {kind === "code" && language && (
            <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground font-mono">
              {language}
            </span>
          )}
          {isStreaming && (
            <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {maxVersion > 1 && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground mr-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handlePrevVersion}
                disabled={version <= 1}
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="tabular-nums min-w-[3ch] text-center">
                v{version}/{maxVersion}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handleNextVersion}
                disabled={version >= maxVersion}
              >
                <ChevronRight className="size-3" />
              </Button>
            </div>
          )}
          {artifactList.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setShowList((v) => !v)}
              title="ファイル一覧"
            >
              <Files className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleCopy}
            title="コピー"
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleDownload}
            title="ダウンロード"
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={closeArtifact}
          >
            <X className="size-4" />
          </Button>
        </div>
        {/* File list dropdown */}
        {showList && (
          <ArtifactListDropdown
            items={artifactList}
            currentId={id}
            onSelect={handleSelectArtifact}
            onClose={() => setShowList(false)}
          />
        )}
      </div>

      {/* Content — key on artifact id forces remount when switching artifacts */}
      <div className="flex-1 overflow-auto">
        <PanelContent
          key={id}
          kind={kind}
          language={language}
          content={content}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}

/** Wrapper with slide animation */
export function AnimatedArtifactPanel() {
  const isOpen = useArtifactStore((s) => s.isOpen);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  // Sync width from panel for animation target
  useEffect(() => {
    if (!isOpen) return;
    const el = document.querySelector("[data-artifact-panel]");
    if (el) setWidth(el.clientWidth);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="shrink-0 overflow-hidden"
        >
          <ArtifactPanel />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
