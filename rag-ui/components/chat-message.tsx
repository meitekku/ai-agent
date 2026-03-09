"use client";

import { memo, useCallback, useState, useRef, useEffect } from "react";
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
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  SendIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}: {
  toolName: string;
  state: string;
}) {
  const isComplete = state === "output-available";

  if (toolName === "searchKnowledgeBase") {
    return (
      <StepIndicator
        icon={SearchIcon}
        activeLabel="ナレッジベースを検索中..."
        completedLabel="ナレッジベースを検索しました"
        active={!isComplete}
      />
    );
  }

  if (toolName === "webSearch") {
    return (
      <StepIndicator
        icon={GlobeIcon}
        activeLabel="ウェブを検索中..."
        completedLabel="ウェブ検索完了"
        active={!isComplete}
      />
    );
  }

  if (toolName === "readPage" || toolName === "readUrl") {
    return (
      <StepIndicator
        icon={FileTextIcon}
        activeLabel="ページを読み込み中..."
        completedLabel="ページ読み込み完了"
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
  onCopy,
  onRegenerate,
  onGenerateSlides,
  onEdit,
  branchInfo,
  onSwitchBranch,
}: {
  message: UIMessage;
  isLoading: boolean;
  isActiveStreaming?: boolean;
  submitTime?: number;
  createdAt?: string;
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
}) {
  const meta = useChatSettingsStore((s) => s.messageMeta[message.id]);
  const serviceName = meta?.service;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
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
        .filter(
          (p): p is { type: "text"; text: string } => p.type === "text",
        )
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
        .filter(
          (p): p is { type: "text"; text: string } => p.type === "text",
        )
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
              if (mediaType.startsWith("image/")) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={key}
                    src={part.url}
                    alt={("filename" in part ? (part as { filename?: string }).filename : undefined) ?? "image"}
                    className="max-h-64 max-w-full rounded-lg border border-border object-contain"
                  />
                );
              }
              // PDF / text / other files — show as a badge
              const filename = ("filename" in part ? (part as { filename?: string }).filename : undefined) ?? "file";
              return (
                <div
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {mediaType === "application/pdf" ? (
                    <FileTextIcon className="size-3.5 text-red-400" />
                  ) : (
                    <FileTextIcon className="size-3.5" />
                  )}
                  <span className="max-w-[200px] truncate">{filename}</span>
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
                  />
                );
              }
              return null;
          }
        })}
        {showThinking ? <ThinkingIndicator /> : null}
        {showGenerating ? <GeneratingIndicator /> : null}
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
    </Message>
  );
});
