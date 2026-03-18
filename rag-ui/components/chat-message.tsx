"use client";

import { memo, useCallback, useState, useRef, useEffect, lazy, Suspense } from "react";
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
  PresentationIcon,
  LayoutIcon,
  ImageIcon,
  PencilIcon,
  FileTextIcon,
  FileIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  XIcon,
  SendIcon,
  Maximize2Icon,
  OctagonIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => stripThinkTags(p.text))
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
}: {
  toolName: string;
  state: string;
  args?: Record<string, unknown>;
}) {
  const isComplete = state === "output-available";

  if (toolName === "searchKnowledgeBase") {
    const kbSlug = typeof args?.kb === "string" ? args.kb : "";
    const label = kbSlug ? `ナレッジベース-${kbSlug}` : "ナレッジベース";
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
        activeLabel={query ? `ウェブを検索中 — 「${query}」` : "ウェブを検索中..."}
        completedLabel={query ? `ウェブ検索完了 — 「${query}」` : "ウェブ検索完了"}
        active={!isComplete}
      />
    );
  }

  if (toolName === "readPage" || toolName === "readUrl") {
    const url = typeof args?.url === "string" ? args.url : "";
    const urls = Array.isArray(args?.urls) ? args.urls as string[] : [];
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
        activeLabel={detail ? `ページを読み込み中 — ${detail}` : "ページを読み込み中..."}
        completedLabel={detail ? `ページ読み込み完了 — ${detail}` : "ページ読み込み完了"}
        active={!isComplete}
      />
    );
  }

  if (toolName === "generateSlides") {
    return (
      <StepIndicator
        icon={PresentationIcon}
        activeLabel="スライドを準備中..."
        completedLabel="スライド生成を開始しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "listDeals") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="商談一覧を取得中..."
        completedLabel="商談一覧を取得しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "fetchDealData") {
    return (
      <StepIndicator
        icon={DatabaseIcon}
        activeLabel="商談データを取得中..."
        completedLabel="商談データを取得しました"
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

  if (toolName === "generateProposal") {
    return (
      <StepIndicator
        icon={PresentationIcon}
        activeLabel="提案書を生成中..."
        completedLabel="提案書を生成しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "loadSkill") {
    const name = typeof args?.name === "string" ? args.name : "";
    return (
      <StepIndicator
        icon={SparklesIcon}
        activeLabel={name ? `スキルを読み込み中 — 「${name}」` : "スキルを読み込み中..."}
        completedLabel={name ? `スキルを読み込みました — 「${name}」` : "スキルを読み込みました"}
        active={!isComplete}
      />
    );
  }

  if (toolName === "generateImage") {
    const prompt = typeof args?.prompt === "string" ? args.prompt : "";
    return (
      <StepIndicator
        icon={ImageIcon}
        activeLabel={prompt ? `画像を生成中 — 「${prompt.slice(0, 40)}${prompt.length > 40 ? "..." : ""}」` : "画像を生成中..."}
        completedLabel={prompt ? `画像を生成しました — 「${prompt.slice(0, 40)}${prompt.length > 40 ? "..." : ""}」` : "画像を生成しました"}
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
  generateSlides: "スライド生成",
  listDeals: "商談一覧",
  fetchDealData: "商談データ取得",
  analyzeDeal: "商談分析",
  generateProposal: "提案書生成",
  generateImage: "画像生成",
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
  | { type: "part"; part: UIMessage["parts"][number]; index: number };

/** Parts that should not break consecutive tool grouping (step-start, empty text, reasoning) */
function isTransparentPart(part: UIMessage["parts"][number]): boolean {
  if (part.type === "step-start") return true;
  if (part.type === "reasoning") return true;
  if (part.type === "text") return stripThinkTags(part.text).trim().length === 0;
  return false;
}

function groupParts(parts: UIMessage["parts"]): GroupedSegment[] {
  const result: GroupedSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Reasoning parts are rendered separately as a consolidated block
    if (part.type === "reasoning") continue;
    if (isToolUIPart(part)) {
      const tn = getToolName(part);
      if (tn === "suggestSlides") continue;
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

const ToolCallGroup = memo(function ToolCallGroup({
  messageId,
  tools,
  isStreaming,
}: {
  messageId: string;
  tools: ToolEntry[];
  isStreaming?: boolean;
}) {
  const allComplete = tools.every(
    (t) => t.part.state === "output-available",
  );
  const [collapsed, setCollapsed] = useState(
    () => allComplete && tools.length >= 2,
  );
  const [userExpanded, setUserExpanded] = useState(false);

  // Auto-collapse when all tools finish
  const prevCompleteRef = useRef(allComplete);

  useEffect(() => {
    if (allComplete && !prevCompleteRef.current && tools.length >= 2) {
      if (userExpanded) {
        // User was viewing all tools — brief delay before collapse
        const timer = setTimeout(() => {
          setCollapsed(true);
          setUserExpanded(false);
        }, 800);
        prevCompleteRef.current = true;
        return () => clearTimeout(timer);
      } else {
        // Was in "only latest" mode — collapse immediately
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync collapse on tool completion
        setCollapsed(true);
        prevCompleteRef.current = true;
      }
    }
    if (!allComplete) prevCompleteRef.current = false;
  }, [allComplete, tools.length, userExpanded]);

  // Single tool
  if (tools.length === 1) {
    const t = tools[0];
    const indicator = (
      <ToolCallIndicator
        toolName={t.toolName}
        state={t.part.state}
        args={t.part.input as Record<string, unknown> | undefined}
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

  // Multiple tools — streaming, not all complete
  if (isStreaming && !allComplete) {
    if (!userExpanded) {
      // Show only the latest tool — old one instantly unmounts via key swap
      const latestTool = tools[tools.length - 1];
      return (
        <div>
          <motion.div
            key={`${messageId}-latest-${latestTool.index}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ToolCallIndicator
              toolName={latestTool.toolName}
              state={latestTool.part.state}
              args={latestTool.part.input as Record<string, unknown> | undefined}
            />
          </motion.div>
          {tools.length > 1 && (
            <button
              onClick={() => setUserExpanded(true)}
              className="inline-flex items-center gap-1 ml-3 mt-0.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            >
              <ChevronDownIcon className="size-2.5" />
              <span>前の{tools.length - 1}ステップを表示</span>
            </button>
          )}
        </div>
      );
    }
    // User expanded — show all tools
    return (
      <div>
        <button
          onClick={() => setUserExpanded(false)}
          className="inline-flex items-center gap-1 ml-3 mb-0.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          <ChevronDownIcon className="size-2.5 rotate-180" />
          <span>最新のみ表示</span>
        </button>
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
              />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // Multiple tools — all complete (or history load): summary row + collapsible
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
          {tools.map((t) => (
            <div key={`${messageId}-${t.index}`}>
              <ToolCallIndicator
                toolName={t.toolName}
                state={t.part.state}
                args={t.part.input as Record<string, unknown> | undefined}
              />
            </div>
          ))}
        </div>
      </motion.div>
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

export const ChatMessage = memo(function ChatMessage({
  message,
  isLoading,
  isActiveStreaming,
  createdAt,
  stopped,
  onCopy,
  onRegenerate,
  onGenerateSlides,
  onEdit,
  branchInfo,
  onSwitchBranch,
  slidePanelSourceId,
  onReopenSlides,
}: {
  message: UIMessage;
  isLoading: boolean;
  isActiveStreaming?: boolean;
  createdAt?: string;
  stopped?: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onGenerateSlides?: (
    text: string,
    mode: "html" | "visual" | "studio" | "simple",
  ) => void;
  onEdit?: (messageId: string, newText: string) => void;
  branchInfo?: {
    index: number;
    total: number;
    siblings: string[];
  } | null;
  onSwitchBranch?: (nodeId: string) => void;
  slidePanelSourceId?: string | null;
  onReopenSlides?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

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
  // Consolidated reasoning parts
  const reasoningParts = message.parts.filter((p) => p.type === "reasoning");
  const reasoningText = reasoningParts
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
  const hasReasoning = reasoningParts.length > 0;
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
        {hasReasoning && message.role === "assistant" && (
          <Reasoning isStreaming={!!isReasoningStreaming}>
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
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}
        {groupParts(message.parts).map((segment) => {
          if (segment.type === "tool-group") {
            return (
              <ToolCallGroup
                key={`${message.id}-tg-${segment.tools[0].index}`}
                messageId={message.id}
                tools={segment.tools}
                isStreaming={isActiveStreaming}
              />
            );
          }
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
                    ? stripThinkTags(part.text)
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
                    className="group/img relative inline-block cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => setLightboxSrc(part.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={part.url}
                      alt={filename}
                      className={isGenerated
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
          {onGenerateSlides && getMessageText(message) && message.parts.some(
            (p) => isToolUIPart(p) && getToolName(p) === "suggestSlides",
          ) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MessageAction tooltip="スライド生成">
                  <PresentationIcon className="size-3.5" />
                </MessageAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem
                  onClick={() =>
                    onGenerateSlides(getMessageText(message), "html")
                  }
                >
                  <LayoutIcon className="size-3.5 mr-2" />
                  HTML スライド
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onGenerateSlides(getMessageText(message), "visual")
                  }
                >
                  <ImageIcon className="size-3.5 mr-2" />
                  ビジュアルスライド
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onGenerateSlides(getMessageText(message), "studio")
                  }
                >
                  <PencilIcon className="size-3.5 mr-2" />
                  スライドスタジオ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onGenerateSlides(getMessageText(message), "simple")
                  }
                >
                  <FileTextIcon className="size-3.5 mr-2" />
                  簡易スライド
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {slidePanelSourceId === message.id && onReopenSlides && (
            <MessageAction tooltip="スライドを開く" onClick={onReopenSlides}>
              <PresentationIcon className="size-3.5 text-primary" />
            </MessageAction>
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
