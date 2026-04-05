"use client";

import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { motion } from "motion/react";
import type { UIMessage } from "ai";
import { isToolUIPart, getToolName } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { StepIndicator } from "@/components/step-indicator";
import {
  CopyIcon,
  CheckIcon,
  RotateCcwIcon,
  SearchIcon,
  GlobeIcon,
  BrainIcon,
  SparklesIcon,
  DatabaseIcon,
  ImageIcon,
  PencilIcon,
  FileTextIcon,
  FileIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  SendIcon,
  Maximize2Icon,
  DownloadIcon,
  OctagonIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useArtifactStore } from "@/lib/artifact-store";

const ImageLightbox = lazy(() =>
  import("@/components/image-lightbox").then((m) => ({
    default: m.ImageLightbox,
  })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Strip markdown images that are either hallucinated (external URLs) or
 *  already rendered from generateImage tool output (duplicate /api/files/ URLs). */
function stripGeneratedImages(
  text: string,
  generatedUrls?: Set<string>,
): string {
  return text
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (match, url: string) => {
      // Always strip external (hallucinated) URLs
      if (/^https?:\/\//.test(url)) return "";
      // Strip /api/files/ URLs already rendered from tool output
      if (generatedUrls?.has(url)) return "";
      return match;
    })
    .replace(/<img\s[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (match, url: string) => {
      if (/^https?:\/\//.test(url)) return "";
      if (generatedUrls?.has(url)) return "";
      return match;
    })
    .trim();
}

/** Extract tool output (AI SDK v6 compat: part.result or part.output) */
function getToolOutput(part: Record<string, unknown>): unknown {
  return ("result" in part ? part.result : part.output) ?? null;
}

/** Aspect ratio → Tailwind class */
const AR_CLASS: Record<string, string> = {
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

// ---------------------------------------------------------------------------
// GeneratedImageCard — fixed-height card with skeleton, fade-in, download
// ---------------------------------------------------------------------------

const GeneratedImageCard = memo(function GeneratedImageCard({
  url,
  aspectRatio = "1:1",
  onClickExpand,
}: {
  url: string;
  aspectRatio?: string;
  onClickExpand: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const arClass = AR_CLASS[aspectRatio] ?? "aspect-square";

  return (
    <div
      className={`group/img relative h-80 max-w-full ${arClass} cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-sm transition-shadow hover:shadow-md`}
      onClick={onClickExpand}
    >
      {/* Skeleton until loaded */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse rounded-xl bg-muted/60" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Generated image"
        className={`size-full rounded-xl object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/15">
        <Maximize2Icon className="size-5 text-white opacity-0 drop-shadow-lg transition-opacity group-hover/img:opacity-90" />
      </div>
      {/* Download button */}
      <a
        href={`${url}?dl=1`}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-md border border-border bg-background/90 shadow-sm backdrop-blur-sm opacity-0 transition-all duration-200 hover:bg-background group-hover/img:opacity-100"
        title="ダウンロード"
      >
        <DownloadIcon className="size-4" />
      </a>
    </div>
  );
});

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => stripGeneratedImages(stripThinkTags(p.text)))
    .join("");
}

// ---------------------------------------------------------------------------
// BranchSelector
// ---------------------------------------------------------------------------

const BranchSelector = memo(function BranchSelector({
  index,
  total,
  siblings,
  onSwitch,
}: {
  index: number;
  total: number;
  siblings: string[];
  onSwitch: (nodeId: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      <button
        onClick={() => index > 0 && onSwitch(siblings[index - 1])}
        disabled={index === 0}
        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
        aria-label="前のブランチ"
      >
        <ChevronLeftIcon className="size-3" />
      </button>
      <span className="tabular-nums min-w-[3ch] text-center">
        {index + 1}/{total}
      </span>
      <button
        onClick={() => index < total - 1 && onSwitch(siblings[index + 1])}
        disabled={index === total - 1}
        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
        aria-label="次のブランチ"
      >
        <ChevronRightIcon className="size-3" />
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ToolCallIndicator — uses StepIndicator with elapsed time
// ---------------------------------------------------------------------------

export const ToolCallIndicator = memo(function ToolCallIndicator({
  toolName,
  state,
  args,
  stopped,
}: {
  toolName: string;
  state: string;
  args?: Record<string, unknown>;
  stopped?: boolean;
}) {
  const isComplete = state === "output-available" || !!stopped;

  const { data: kbs = [] } = useQuery<{ slug: string; name: string }[]>({
    queryKey: ["kbs"],
    queryFn: async () => {
      const res = await fetch("/api/kbs");
      if (!res.ok) return [];
      const data = await res.json();
      return data.knowledge_bases ?? data ?? [];
    },
    staleTime: 60_000,
  });

  if (toolName === "searchKnowledgeBase") {
    const kbSlug = typeof args?.kb === "string" ? args.kb : "";
    const kbMatch = kbs.find((k) => k.slug === kbSlug);
    const label = kbMatch?.name
      ? `「${kbMatch.name}」`
      : kbSlug
        ? `ナレッジベース-${kbSlug}`
        : "ナレッジベース";
    return (
      <StepIndicator
        icon={SearchIcon}
        activeLabel={`${label} を検索中...`}
        completedLabel={`${label} を検索しました`}
        active={!isComplete}
      />
    );
  }

  if (toolName === "webSearch" || toolName === "google_search") {
    const query = typeof args?.query === "string" ? args.query : "";
    return (
      <StepIndicator
        icon={GlobeIcon}
        activeLabel={
          query ? `ウェブを検索中 — 「${query}」` : "ウェブを検索中..."
        }
        completedLabel={
          query ? `ウェブ検索完了 — 「${query}」` : "ウェブ検索完了"
        }
        active={!isComplete}
        tooltip={query || undefined}
      />
    );
  }

  if (toolName === "readPage" || toolName === "readUrl") {
    const url = typeof args?.url === "string" ? args.url : "";
    const urls = Array.isArray(args?.urls) ? (args.urls as string[]) : [];
    const target = url || (urls.length > 0 ? urls[0] : "");
    let host = "";
    try {
      if (target) host = new URL(target).hostname;
    } catch {}
    const detail = host
      ? urls.length > 1
        ? `${host} 他${urls.length - 1}件`
        : host
      : "";
    return (
      <StepIndicator
        icon={FileTextIcon}
        activeLabel={
          detail ? `ページを読み込み中 — ${detail}` : "ページを読み込み中..."
        }
        completedLabel={
          detail ? `ページ読み込み完了 — ${detail}` : "ページ読み込み完了"
        }
        active={!isComplete}
      />
    );
  }

  if (toolName === "listSalesforceDeals") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="Salesforceから商談一覧を取得中..."
        completedLabel="Salesforceから商談一覧を取得しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "listKintoneDeals") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="Kintoneから案件一覧を取得中..."
        completedLabel="Kintoneから案件一覧を取得しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "fetchSalesforceData") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="Salesforceから商談データを取得中..."
        completedLabel="Salesforceから商談データを取得しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "fetchKintoneData") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="Kintoneからデータを取得中..."
        completedLabel="Kintoneからデータを取得しました"
        active={!isComplete}
      />
    );
  }


  if (toolName === "analyzeDeal") {
    return (
      <StepIndicator
        icon={BrainIcon}
        activeLabel="商談を分析中..."
        completedLabel="商談分析完了"
        active={!isComplete}
      />
    );
  }

  if (toolName === "fetchAndAnalyze") {
    return (
      <StepIndicator
        icon={BrainIcon}
        activeLabel="商談データを取得・分析中..."
        completedLabel="商談分析完了"
        active={!isComplete}
      />
    );
  }

  if (toolName === "loadSkill") {
    const name = typeof args?.name === "string" ? args.name : "";
    return (
      <StepIndicator
        icon={SparklesIcon}
        activeLabel={
          name ? `スキルを読み込み中 — 「${name}」` : "スキルを読み込み中..."
        }
        completedLabel={
          name
            ? `スキルを読み込みました — 「${name}」`
            : "スキルを読み込みました"
        }
        active={!isComplete}
      />
    );
  }

  if (toolName === "generateImage") {
    const prompt = typeof args?.prompt === "string" ? args.prompt : "";
    return (
      <StepIndicator
        icon={ImageIcon}
        activeLabel={
          prompt
            ? `画像を生成中 — 「${prompt.slice(0, 40)}${prompt.length > 40 ? "..." : ""}」`
            : "画像を生成中..."
        }
        completedLabel={
          prompt
            ? `画像を生成しました — 「${prompt.slice(0, 40)}${prompt.length > 40 ? "..." : ""}」`
            : "画像を生成しました"
        }
        active={!isComplete}
      />
    );
  }

  return (
    <StepIndicator
      icon={SearchIcon}
      activeLabel={`${toolName} 実行中...`}
      completedLabel={`${toolName} 完了`}
      active={!isComplete}
    />
  );
});

// ---------------------------------------------------------------------------
// Tool call grouping — consecutive tool calls collapse into a summary
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolEntry = { part: any; index: number; toolName: string };

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  loadSkill: "スキル読み込み",
  searchKnowledgeBase: "KB検索",
  webSearch: "ウェブ検索",
  google_search: "ウェブ検索",
  readPage: "ページ読み込み",
  readUrl: "ページ読み込み",
  listSalesforceDeals: "Salesforce商談一覧",
  listKintoneDeals: "Kintone案件一覧",
  fetchSalesforceData: "Salesforce商談データ",
  fetchKintoneData: "Kintoneデータ",
  analyzeDeal: "商談分析",
  fetchAndAnalyze: "商談分析",
  generateImage: "画像生成",
  artifact: "アーティファクト",
};

function getGroupSummary(tools: ToolEntry[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) {
    const name = TOOL_DISPLAY_NAMES[t.toolName] ?? t.toolName;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts)
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join("、");
}

type GroupedSegment =
  | { type: "tool-group"; tools: ToolEntry[] }
  | { type: "reasoning"; text: string; index: number }
  | { type: "part"; part: UIMessage["parts"][number]; index: number };

/** Parts that should not break consecutive tool grouping (empty text) */
function isTransparentPart(part: UIMessage["parts"][number]): boolean {
  if (part.type === "text")
    return stripThinkTags(part.text).trim().length === 0;
  return false;
}

function groupParts(parts: UIMessage["parts"]): GroupedSegment[] {
  const result: GroupedSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Reasoning parts: merge consecutive ones, emit as inline reasoning segment
    if (part.type === "reasoning") {
      const text = (part as { text: string }).text || "";
      if (!text.trim()) continue;
      // Merge with previous reasoning segment if adjacent (skip step-start between them)
      const prev = result.at(-1);
      if (prev?.type === "reasoning") {
        prev.text += "\n\n" + text;
      } else {
        result.push({ type: "reasoning", text, index: i });
      }
      continue;
    }
    if (part.type === "step-start") continue;
    if (isToolUIPart(part)) {
      const tn = getToolName(part);
      // Find the nearest tool-group, skipping transparent parts in between
      let targetGroup: (GroupedSegment & { type: "tool-group" }) | null = null;
      for (let j = result.length - 1; j >= 0; j--) {
        const seg = result[j];
        if (seg.type === "tool-group") {
          targetGroup = seg;
          break;
        }
        if (seg.type === "part" && isTransparentPart(seg.part)) continue;
        break; // non-transparent part — stop looking
      }
      if (targetGroup) {
        targetGroup.tools.push({ part, index: i, toolName: tn });
      } else {
        result.push({
          type: "tool-group",
          tools: [{ part, index: i, toolName: tn }],
        });
      }
    } else {
      result.push({ type: "part", part, index: i });
    }
  }
  return result;
}

// Clickable artifact card — shown when artifact tool completes
const ArtifactCard = memo(function ArtifactCard({
  result,
}: {
  result: Record<string, unknown>;
}) {
  const artifactId = result.id as string | undefined;
  const artifactTitle = result.title as string | undefined;
  const artifactKind = result.kind as string | undefined;
  const artifactVersion = result.version as number | undefined;

  const handleClick = useCallback(async () => {
    if (!artifactId) return;
    // If store already has this artifact, just reopen
    const store = useArtifactStore.getState();
    if (store.id === artifactId && store.content) {
      useArtifactStore.setState({ isOpen: true });
      return;
    }
    try {
      const res = await fetch(`/api/artifacts/${artifactId}`);
      if (!res.ok) return;
      const data = await res.json();
      useArtifactStore.getState().openArtifact({
        id: data.id,
        title: data.title,
        kind: data.kind,
        content: data.content,
        version: data.currentVersion,
        versions: data.versions,
      });
    } catch (e) {
      console.error("[ArtifactCard] fetch failed:", e);
    }
  }, [artifactId]);

  if (!artifactId) return null;

  const kindLabel =
    artifactKind === "html"
      ? "HTML"
      : artifactKind === "code"
        ? "Code"
        : artifactKind === "markdown"
          ? "Markdown"
          : "Text";

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent/50 transition-colors cursor-pointer w-fit max-w-sm"
    >
      <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
        <FileTextIcon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {artifactTitle || "Artifact"}
        </div>
        <div className="text-xs text-muted-foreground">
          {kindLabel}
          {artifactVersion ? ` · v${artifactVersion}` : ""}
        </div>
      </div>
    </button>
  );
});

const ToolCallGroup = memo(function ToolCallGroup({
  messageId,
  tools,
  isStreaming,
  stopped,
}: {
  messageId: string;
  tools: ToolEntry[];
  isStreaming?: boolean;
  stopped?: boolean;
}) {
  const allComplete = tools.every((t) => t.part.state === "output-available") || !!stopped;
  // Start collapsed only when loaded from history (not streaming)
  const [collapsed, setCollapsed] = useState(
    () => !isStreaming && allComplete && tools.length >= 2,
  );

  // Auto-collapse when streaming ends with multiple completed tools
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && allComplete && tools.length >= 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse once when streaming ends
      setCollapsed(true);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, allComplete, tools.length]);

  // Single tool — always show inline
  if (tools.length === 1) {
    const t = tools[0];

    // Artifact tool — show clickable card when complete
    if (t.toolName === "artifact" && t.part.state === "output-available") {
      const result = (t.part.result ?? t.part.output ?? {}) as Record<string, unknown>;
      if (result.id) {
        return <ArtifactCard result={result} />;
      }
    }

    const indicator = (
      <ToolCallIndicator
        toolName={t.toolName}
        state={t.part.state}
        args={t.part.input as Record<string, unknown> | undefined}
        stopped={stopped}
      />
    );
    if (!isStreaming) return indicator;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {indicator}
      </motion.div>
    );
  }

  // During streaming: always show ALL tools stacked (never hide running tools)
  if (isStreaming) {
    return (
      <div className="space-y-1 py-0.5">
        {tools.map((t) => (
          <motion.div
            key={`${messageId}-${t.index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <ToolCallIndicator
              toolName={t.toolName}
              state={t.part.state}
              args={t.part.input as Record<string, unknown> | undefined}
              stopped={stopped}
            />
          </motion.div>
        ))}
      </div>
    );
  }

  // Not streaming (history or finished): summary row + collapsible
  // Extract completed artifact tools to show as always-visible cards
  const isCompletedArtifact = (t: (typeof tools)[number]) =>
    t.toolName === "artifact" &&
    t.part.state === "output-available" &&
    ((t.part.result ?? t.part.output) as Record<string, unknown> | undefined)
      ?.id;
  const artifactTools = tools.filter(isCompletedArtifact);
  const nonArtifactTools = tools.filter((t) => !isCompletedArtifact(t));

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <CheckIcon className="size-3.5 shrink-0 text-primary/60" />
        <span>{getGroupSummary(tools)} 完了</span>
        <motion.span
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <ChevronRightIcon className="size-3 ml-0.5 opacity-40" />
        </motion.span>
      </button>
      <motion.div
        animate={{
          height: collapsed ? 0 : "auto",
          opacity: collapsed ? 0 : 1,
        }}
        initial={false}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        <div className="space-y-1 py-0.5">
          {nonArtifactTools.map((t) => (
            <div key={`${messageId}-${t.index}`}>
              <ToolCallIndicator
                toolName={t.toolName}
                state={t.part.state}
                args={t.part.input as Record<string, unknown> | undefined}
                stopped={stopped}
              />
            </div>
          ))}
        </div>
      </motion.div>
      {/* Artifact cards always visible outside collapsible */}
      {artifactTools.map((t) => (
        <ArtifactCard
          key={`${messageId}-${t.index}`}
          result={
            (t.part.result ?? t.part.output) as Record<string, unknown>
          }
        />
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Streaming phase indicators
// ---------------------------------------------------------------------------

const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <StepIndicator
      icon={BrainIcon}
      activeLabel="クエリを分析中..."
      completedLabel="クエリを分析しました"
      active
    />
  );
});

const GeneratingIndicator = memo(function GeneratingIndicator() {
  return (
    <StepIndicator
      icon={SparklesIcon}
      activeLabel="回答を生成中..."
      completedLabel="回答を生成しました"
      active
    />
  );
});

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MessageFile type — files associated with a message
// ---------------------------------------------------------------------------

export interface MessageFile {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// FileCard — clickable file card shown at message bottom (Claude Web style)
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, typeof FileTextIcon> = {
  image: ImageIcon,
  text: FileTextIcon,
  application: FileIcon,
};

const FileCard = memo(function FileCard({
  file,
}: {
  file: MessageFile;
}) {
  const typeCategory = file.mediaType.split("/")[0];
  const ext = file.mediaType.split("/")[1]?.toUpperCase() ?? "";
  const Icon = FILE_ICONS[typeCategory] ?? FileIcon;

  const canPreview =
    file.mediaType.startsWith("image/") ||
    file.mediaType === "text/html" ||
    file.mediaType === "text/markdown" ||
    file.mediaType === "text/plain";

  return (
    <a
      href={`/api/files/${file.id}${canPreview ? "" : "?dl=1"}`}
      download={canPreview ? undefined : file.originalName}
      target={canPreview ? "_blank" : undefined}
      rel={canPreview ? "noopener" : undefined}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer w-fit max-w-sm"
    >
      <div className="flex size-10 items-center justify-center rounded-md bg-muted/60">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{file.originalName}</div>
        <div className="text-xs text-muted-foreground">
          {ext} · {formatBytes(file.sizeBytes)}
        </div>
      </div>
      <div className="shrink-0 text-xs text-muted-foreground border rounded-md px-2.5 py-1 hover:bg-muted transition-colors">
        {canPreview ? "プレビュー" : "ダウンロード"}
      </div>
    </a>
  );
});

// ---------------------------------------------------------------------------
// ChatMessage — main component
// ---------------------------------------------------------------------------

export const ChatMessage = memo(function ChatMessage({
  message,
  isLoading,
  isActiveStreaming,
  createdAt,
  stopped,
  files,
  onCopy,
  onRegenerate,
  onEdit,
  branchInfo,
  onSwitchBranch,
}: {
  message: UIMessage;
  isLoading: boolean;
  isActiveStreaming?: boolean;
  createdAt?: string;
  stopped?: boolean;
  files?: MessageFile[];
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onEdit?: (messageId: string, newText: string) => void;
  branchInfo?: {
    index: number;
    total: number;
    siblings: string[];
  } | null;
  onSwitchBranch?: (nodeId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Collect image URLs from generateImage tool outputs for dedup
  const generatedImageUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const part of message.parts) {
      if (!isToolUIPart(part) || getToolName(part) !== "generateImage") continue;
      if (part.state !== "output-available") continue;
      const out = getToolOutput(part as Record<string, unknown>) as {
        success?: boolean;
        images?: { url: string }[];
      } | null;
      if (out?.success && Array.isArray(out.images)) {
        for (const img of out.images) urls.add(img.url);
      }
    }
    return urls;
  }, [message.parts]);

  const handleCopy = useCallback(() => {
    onCopy(getMessageText(message));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message, onCopy]);

  const handleStartEdit = useCallback(() => {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    setEditText(text);
    setEditing(true);
  }, [message]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(
        editRef.current.value.length,
        editRef.current.value.length,
      );
    }
  }, [editing]);

  const handleSubmitEdit = useCallback(() => {
    if (!editText.trim() || !onEdit) return;
    setEditing(false);
    onEdit(message.id, editText.trim());
  }, [editText, onEdit, message.id]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmitEdit();
      }
      if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSubmitEdit, handleCancelEdit],
  );
  const hasReasoning = message.parts.some((p) => p.type === "reasoning");
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isActiveStreaming && lastPart?.type === "reasoning";

  // Determine extra streaming indicators
  const showThinking =
    isActiveStreaming &&
    !hasReasoning &&
    (() => {
      const toolParts = message.parts.filter((p) => isToolUIPart(p));
      const strippedText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => stripThinkTags(p.text))
        .join("")
        .trim();
      return toolParts.length === 0 && !strippedText;
    })();

  const showGenerating =
    isActiveStreaming &&
    !isReasoningStreaming &&
    (() => {
      const toolParts = message.parts.filter((p) => isToolUIPart(p));
      const allToolsComplete =
        toolParts.length > 0 &&
        toolParts.every(
          (p) => isToolUIPart(p) && p.state === "output-available",
        );
      const strippedText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => stripThinkTags(p.text))
        .join("")
        .trim();
      return allToolsComplete && !strippedText;
    })();

  // Render editing mode for user messages
  if (editing && message.role === "user") {
    return (
      <Message from="user" className="animate-fade-in-up">
        <MessageContent>
          <div className="space-y-2">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full min-h-[80px] rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmitEdit}
                disabled={!editText.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <SendIcon className="size-3" />
                送信
              </button>
              <button
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <XIcon className="size-3" />
                キャンセル
              </button>
            </div>
          </div>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from={message.role} className="animate-fade-in-up">
      <MessageContent>
        {groupParts(message.parts).map((segment) => {
          if (segment.type === "reasoning" && message.role === "assistant") {
            // Check if this is the last reasoning segment and currently streaming
            const isLast =
              isReasoningStreaming &&
              segment.index ===
                message.parts.reduce(
                  (last, p, idx) =>
                    p.type === "reasoning" ? idx : last,
                  -1,
                );
            return (
              <Reasoning
                key={`${message.id}-r-${segment.index}`}
                isStreaming={!!isLast}
              >
                <ReasoningTrigger
                  getThinkingMessage={(streaming, dur) =>
                    streaming || dur === 0 ? (
                      <span className="animate-pulse">思考中...</span>
                    ) : dur === undefined ? (
                      <span>数秒間思考しました</span>
                    ) : (
                      <span>{dur}秒間思考しました</span>
                    )
                  }
                />
                <ReasoningContent>{segment.text}</ReasoningContent>
              </Reasoning>
            );
          }
          if (segment.type === "tool-group") {
            // Extract generateImage entries with aspect ratio
            const genImageTools = segment.tools.filter(
              (t) => t.toolName === "generateImage",
            );
            const isGeneratingImage = !stopped && genImageTools.some(
              (t) => t.part.state !== "output-available",
            );
            // Collect completed images with their aspect ratio
            const genImageEntries = genImageTools.flatMap((t) => {
              if (t.part.state !== "output-available") return [];
              const out = getToolOutput(
                t.part as Record<string, unknown>,
              ) as {
                success?: boolean;
                images?: { url: string; mediaType: string }[];
              } | null;
              if (!out?.success || !Array.isArray(out.images)) return [];
              const ar =
                t.part.input &&
                typeof t.part.input === "object" &&
                "aspectRatio" in t.part.input
                  ? ((t.part.input as { aspectRatio?: string }).aspectRatio ??
                    "1:1")
                  : "1:1";
              return out.images.map((img) => ({ ...img, aspectRatio: ar }));
            });
            // Determine skeleton aspect ratio from the generating tool's args
            const skeletonAr = (() => {
              if (!isGeneratingImage) return "1:1";
              const imgTool = genImageTools.find(
                (t) => t.part.state !== "output-available",
              );
              return (
                (imgTool?.part.input &&
                typeof imgTool.part.input === "object" &&
                "aspectRatio" in imgTool.part.input
                  ? (imgTool.part.input as { aspectRatio?: string }).aspectRatio
                  : undefined) ?? "1:1"
              );
            })();

            return (
              <div key={`${message.id}-tg-${segment.tools[0].index}`}>
                <ToolCallGroup
                  messageId={message.id}
                  tools={segment.tools}
                  isStreaming={isActiveStreaming}
                  stopped={stopped}
                />
                {/* Skeleton placeholder while image is generating */}
                {isGeneratingImage && (
                  <div
                    className={`mt-2 h-80 max-w-full ${AR_CLASS[skeletonAr] ?? "aspect-square"} animate-pulse rounded-xl bg-muted/60`}
                  />
                )}
                {/* Render generated images directly from tool output */}
                {genImageEntries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {genImageEntries.map((img) => (
                      <GeneratedImageCard
                        key={img.url}
                        url={img.url}
                        aspectRatio={img.aspectRatio}
                        onClickExpand={() => setLightboxSrc(img.url)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (segment.type !== "part") return null;
          const { part, index: i } = segment;
          const key = `${message.id}-${i}`;
          switch (part.type) {
            case "text":
              return (
                <MessageResponse
                  key={key}
                  isActiveStreaming={
                    message.role === "assistant" ? isActiveStreaming : false
                  }
                >
                  {message.role === "assistant"
                    ? stripGeneratedImages(
                        stripThinkTags(part.text),
                        generatedImageUrls,
                      )
                    : part.text}
                </MessageResponse>
              );
            case "file": {
              const mediaType = part.mediaType ?? "";
              const filename =
                ("filename" in part
                  ? (part as { filename?: string }).filename
                  : undefined) ?? "file";
              if (mediaType.startsWith("image/")) {
                const isGenerated = message.role === "assistant";
                return (
                  <div
                    key={key}
                    className="group/img relative inline-block w-fit cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => setLightboxSrc(part.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={part.url}
                      alt={filename}
                      className={
                        isGenerated
                          ? "block max-w-md rounded-xl"
                          : "block size-14 object-cover"
                      }
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/15">
                      <Maximize2Icon className="size-4 text-white opacity-0 drop-shadow-md transition-opacity group-hover/img:opacity-90" />
                    </div>
                  </div>
                );
              }
              // PDF / text / other files — square with icon
              return (
                <div
                  key={key}
                  className="inline-flex size-14 items-center justify-center rounded-lg border border-border/60 bg-muted/20 shadow-sm"
                  title={filename}
                >
                  {mediaType === "application/pdf" ? (
                    <FileIcon className="size-6 text-red-400" />
                  ) : (
                    <FileTextIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
              );
            }
            default:
              return null;
          }
        })}
        {showThinking ? <ThinkingIndicator /> : null}
        {showGenerating ? <GeneratingIndicator /> : null}
        {stopped && message.role === "assistant" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mt-1">
            <OctagonIcon className="size-3" />
            <span>回答が中断されました</span>
          </div>
        )}
      </MessageContent>

      {/* File cards — generated files associated with this message */}
      {files && files.length > 0 && message.role === "assistant" && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f) => (
            <FileCard key={f.id} file={f} />
          ))}
        </div>
      )}

      {/* User message actions: edit + timestamp + branch selector — always rendered, visible on hover */}
      {message.role === "user" ? (
        <MessageActions className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
          {onEdit && !isLoading && (
            <MessageAction tooltip="編集" onClick={handleStartEdit}>
              <PencilIcon className="size-3.5" />
            </MessageAction>
          )}
          {createdAt && (
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
              {new Date(createdAt).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {branchInfo && onSwitchBranch && (
            <BranchSelector
              index={branchInfo.index}
              total={branchInfo.total}
              siblings={branchInfo.siblings}
              onSwitch={onSwitchBranch}
            />
          )}
        </MessageActions>
      ) : null}

      {/* Assistant message actions */}
      {message.role === "assistant" && !isActiveStreaming ? (
        <MessageActions>
          <MessageAction
            tooltip={copied ? "コピー済み" : "コピー"}
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-green-500" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </MessageAction>
          <MessageAction tooltip="再生成" onClick={onRegenerate}>
            <RotateCcwIcon className="size-3.5" />
          </MessageAction>
          {branchInfo && onSwitchBranch && (
            <BranchSelector
              index={branchInfo.index}
              total={branchInfo.total}
              siblings={branchInfo.siblings}
              onSwitch={onSwitchBranch}
            />
          )}
        </MessageActions>
      ) : null}

      {/* Image lightbox */}
      {lightboxSrc && (
        <Suspense>
          <ImageLightbox
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        </Suspense>
      )}
    </Message>
  );
});
