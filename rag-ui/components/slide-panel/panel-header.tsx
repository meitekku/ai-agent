"use client";

import { cn } from "@/lib/utils";
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
  GlobeIcon,
} from "lucide-react";
import { FONT_PRESETS } from "./constants";
import type { Phase } from "./types";

interface PanelHeaderProps {
  // Panel state
  phase: Phase;
  deckTitle: string;
  expanded: boolean;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  exporting: boolean;
  exportingPdf: boolean;
  redrawing: boolean;
  scale: number;
  scaleRef: React.MutableRefObject<number>;
  failedCount: number;

  // Version state
  maxVersion: number;
  currentVersion: number;
  browsingVersion: number | null;
  isBrowsingHistory: boolean;
  restoringVersion: boolean;

  // Handlers
  closePanel: () => void;
  setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  setScale: (s: number) => void;
  setFullscreen: (v: boolean) => void;

  // Editing handlers
  handleToggleEditing: () => void;
  applyGlobalFont: (cssFont: string) => void;
  adjustFocusedFontSize: (delta: number) => void;
  redrawCurrentSlide: () => void;

  // Action handlers
  handleCancel: () => void;
  handleSave: () => void;
  handleExport: () => void;
  handlePdfExport: () => void;
  handleHtmlExport: () => void;
  retryFailed: () => void;

  // Version handlers
  handleBrowseVersion: (direction: "prev" | "next") => void;
  handleRestoreVersion: () => void;
}

export function PanelHeader({
  phase,
  deckTitle,
  expanded,
  editing,
  saving,
  saved,
  exporting,
  exportingPdf,
  redrawing,
  scale,
  scaleRef,
  failedCount,
  maxVersion,
  currentVersion,
  browsingVersion,
  isBrowsingHistory,
  restoringVersion,
  closePanel,
  setExpanded,
  setScale,
  setFullscreen,
  handleToggleEditing,
  applyGlobalFont,
  adjustFocusedFontSize,
  redrawCurrentSlide,
  handleCancel,
  handleSave,
  handleExport,
  handlePdfExport,
  handleHtmlExport,
  retryFailed,
  handleBrowseVersion,
  handleRestoreVersion,
}: PanelHeaderProps) {
  const isWorking = phase === "planning" || phase === "generating";

  return (
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
          <span
            className={cn(
              "tabular-nums min-w-[4ch] text-center",
              isBrowsingHistory && "text-amber-500 font-medium",
            )}
          >
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
          <button
            onClick={handleHtmlExport}
            disabled={exporting || exportingPdf}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            title="HTML プレゼンテーション"
          >
            <GlobeIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
