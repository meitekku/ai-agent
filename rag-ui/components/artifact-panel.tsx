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
  FileDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useCallback, useState, useRef } from "react";

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

/** Detect complete HTML documents that need direct srcdoc rendering */
function isFullHtmlDocument(html: string): boolean {
  const head = html.trimStart().slice(0, 200).toLowerCase();
  return head.includes("<!doctype") || (head.includes("<html") && head.includes("<head"));
}

/** Capture HTML content as PNG via hidden iframe + html2canvas */
async function captureHtmlAsPng(html: string): Promise<string> {
  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  Object.assign(container.style, { position: "fixed", left: "-9999px", top: "0", opacity: "0" });
  document.body.appendChild(container);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:1280px;height:720px;border:none";
  iframe.srcdoc = html;
  container.appendChild(iframe);

  await new Promise<void>((resolve) => { iframe.onload = () => resolve(); });
  try { await iframe.contentDocument?.fonts.ready; } catch {}
  await new Promise((r) => setTimeout(r, 1500));

  const body = iframe.contentDocument?.body;
  if (!body) { container.remove(); throw new Error("iframe body not found"); }

  const canvas = await html2canvas(body, {
    width: 1280, height: 720, scale: 2, useCORS: true, backgroundColor: null,
  });
  container.remove();
  return canvas.toDataURL("image/png");
}

/** Export HTML slides as PDF */
async function exportPdf(html: string, title: string): Promise<void> {
  // Find all slides and capture each
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const slideCount = doc.querySelectorAll(".slide").length || 1;

  const pngs: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    // Inject JS to navigate to slide i before capturing
    const slideHtml = html.replace(
      "</body>",
      `<script>
        try {
          const slides = document.querySelectorAll('.slide');
          slides.forEach((s, idx) => {
            s.classList.toggle('active', idx === ${i});
            s.style.opacity = idx === ${i} ? '1' : '0';
            s.style.visibility = idx === ${i} ? 'visible' : 'hidden';
            s.style.zIndex = idx === ${i} ? '10' : '1';
            s.querySelectorAll('.anim-elem').forEach(e => { e.style.opacity = '1'; e.style.transform = 'none'; });
          });
        } catch(e) {}
      </script></body>`,
    );
    pngs.push(await captureHtmlAsPng(slideHtml));
  }

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });
  for (let i = 0; i < pngs.length; i++) {
    if (i > 0) pdf.addPage([1280, 720], "landscape");
    pdf.addImage(pngs[i].split(",")[1], "PNG", 0, 0, 1280, 720);
  }
  const safeName = (title || "artifact").replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g, "_");
  pdf.save(`${safeName}.pdf`);
}

/** Export HTML slides as PPTX */
async function exportPptx(html: string, title: string): Promise<void> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const slideCount = doc.querySelectorAll(".slide").length || 1;

  const pngs: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    const slideHtml = html.replace(
      "</body>",
      `<script>
        try {
          const slides = document.querySelectorAll('.slide');
          slides.forEach((s, idx) => {
            s.classList.toggle('active', idx === ${i});
            s.style.opacity = idx === ${i} ? '1' : '0';
            s.style.visibility = idx === ${i} ? 'visible' : 'hidden';
            s.style.zIndex = idx === ${i} ? '10' : '1';
            s.querySelectorAll('.anim-elem').forEach(e => { e.style.opacity = '1'; e.style.transform = 'none'; });
          });
        } catch(e) {}
      </script></body>`,
    );
    pngs.push(await captureHtmlAsPng(slideHtml));
  }

  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  for (const png of pngs) {
    const slide = pptx.addSlide();
    slide.addImage({ data: png, x: 0, y: 0, w: "100%", h: "100%" });
  }
  const safeName = (title || "artifact").replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g, "_");
  await pptx.writeFile({ fileName: `${safeName}.pptx` });
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
    // Complete HTML documents → direct srcdoc iframe (fixes white screen)
    // Fragments (widget-style) → WidgetRenderer with morphdom streaming
    if (!isStreaming && isFullHtmlDocument(content)) {
      return (
        <iframe
          srcDoc={content}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          style={{ minHeight: "100%" }}
          title="Artifact preview"
        />
      );
    }
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
  const isHtmlSlides = kind === "html" && isFullHtmlDocument(content);
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

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try { await exportPdf(content, title); } catch (e) { console.error("[ArtifactPanel] PDF export failed:", e); }
    setExportingPdf(false);
  }, [content, title, exportingPdf]);

  const handleExportPptx = useCallback(async () => {
    if (exportingPptx) return;
    setExportingPptx(true);
    try { await exportPptx(content, title); } catch (e) { console.error("[ArtifactPanel] PPTX export failed:", e); }
    setExportingPptx(false);
  }, [content, title, exportingPptx]);

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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6" onClick={handlePrevVersion} disabled={version <= 1}>
                    <ChevronLeft className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>前のバージョン</TooltipContent>
              </Tooltip>
              <span className="tabular-nums min-w-[3ch] text-center">
                v{version}/{maxVersion}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6" onClick={handleNextVersion} disabled={version >= maxVersion}>
                    <ChevronRight className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>次のバージョン</TooltipContent>
              </Tooltip>
            </div>
          )}
          {artifactList.length > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowList((v) => !v)}>
                  <Files className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>ファイル一覧</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy}>
                {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "コピー済み" : "コピー"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleDownload}>
                <Download className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>HTMLダウンロード</TooltipContent>
          </Tooltip>
          {isHtmlSlides && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={handleExportPdf} disabled={exportingPdf}>
                    {exportingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>PDFエクスポート</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={handleExportPptx} disabled={exportingPptx}>
                    {exportingPptx ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[9px] font-bold">PPT</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>PPTXエクスポート</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={closeArtifact}>
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>閉じる</TooltipContent>
          </Tooltip>
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
