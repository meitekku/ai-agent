"use client";

import { memo, useCallback, useState, useRef, useEffect, lazy, Suspense } from "react";
import type { UIMessage } from "ai";
import { isToolUIPart, getToolName } from "ai";
import { useChatSettingsStore } from "@/lib/store";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { StepIndicator } from "@/components/step-indicator";
import {
  useResponseTimings,
  ResponseTimingBadge,
} from "@/components/response-timing";
import { Badge } from "@/components/ui/badge";
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
    const query = typeof args?.query === "string" ? args.query : "";
    const kb = typeof args?.kb === "string" ? args.kb : "";
    const detail = [kb && `KB: ${kb}`, query && `「${query}」`]
      .filter(Boolean)
      .join(" ");
    return (
      <StepIndicator
        icon={SearchIcon}
        activeLabel={detail ? `ナレッジベースを検索中 — ${detail}` : "ナレッジベースを検索中..."}
        completedLabel={detail ? `ナレッジベースを検索しました — ${detail}` : "ナレッジベースを検索しました"}
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
  submitTime,
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
  submitTime?: number;
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
  const meta = useChatSettingsStore((s) => s.messageMeta[message.id]);
  const serviceName = meta?.service;
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

  // Track response timings for this message
  const timings = useResponseTimings(message, isActiveStreaming, submitTime);

  // Determine extra streaming indicators
  const showThinking =
    isActiveStreaming &&
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
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;
          switch (part.type) {
            case "text":
              return (
                <MessageResponse key={key}>
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
                return (
                  <div
                    key={key}
                    className="group/img relative inline-block cursor-pointer overflow-hidden rounded-lg border border-border/60 bg-muted/20 shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => setLightboxSrc(part.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={part.url}
                      alt={filename}
                      className="block size-14 object-cover"
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
              if (isToolUIPart(part)) {
                return (
                  <ToolCallIndicator
                    key={key}
                    toolName={getToolName(part)}
                    state={part.state}
                    args={(part as Record<string, unknown>).input as Record<string, unknown> | undefined}
                  />
                );
              }
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
          {onGenerateSlides && getMessageText(message) ? (
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
          {serviceName ? (
            <Badge
              variant="secondary"
              className="cursor-default gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-normal text-foreground/70 hover:bg-secondary"
            >
              <DatabaseIcon className="size-3" />
              {serviceName === "pageindex" ? "PageIndex" : "LightRAG"}
            </Badge>
          ) : null}
          {timings ? <ResponseTimingBadge timestamps={timings} /> : null}
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
