"use client";

import { memo, useCallback, useState } from "react";
import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { useChatSettingsStore } from "@/lib/store";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { StepIndicator } from "@/components/step-indicator";
import { useResponseTimings, ResponseTimingBadge } from "@/components/response-timing";
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

  if (toolName === "getInformation") {
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

  if (toolName === "readPage") {
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
  onCopy,
  onRegenerate,
  onGenerateSlides,
}: {
  message: UIMessage;
  isLoading: boolean;
  isActiveStreaming?: boolean;
  submitTime?: number;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onGenerateSlides?: (text: string, mode: "html" | "visual" | "studio" | "simple") => void;
}) {
  const meta = useChatSettingsStore((s) => s.messageMeta[message.id]);
  const serviceName = meta?.service;
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    onCopy(getMessageText(message));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message, onCopy]);

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
        toolParts.every((p) => isToolUIPart(p) && p.state === "output-available");
      const strippedText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => stripThinkTags(p.text))
        .join("")
        .trim();
      return allToolsComplete && !strippedText;
    })();

  return (
    <Message from={message.role} className="animate-fade-in-up">
      <MessageContent>
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;
          switch (part.type) {
            case "text":
              return (
                <MessageResponse key={key}>
                  {message.role === "assistant" ? stripThinkTags(part.text) : part.text}
                </MessageResponse>
              );
            default:
              if (isToolUIPart(part)) {
                return (
                  <ToolCallIndicator
                    key={key}
                    toolName={part.type.replace(/^tool-/, "")}
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
      {message.role === "assistant" && !isActiveStreaming ? (
        <MessageActions>
          <MessageAction tooltip={copied ? "コピー済み" : "コピー"} onClick={handleCopy}>
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
                <DropdownMenuItem onClick={() => onGenerateSlides(getMessageText(message), "html")}>
                  <LayoutIcon className="size-3.5 mr-2" />
                  HTML スライド
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onGenerateSlides(getMessageText(message), "visual")}
                >
                  <ImageIcon className="size-3.5 mr-2" />
                  ビジュアルスライド
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onGenerateSlides(getMessageText(message), "studio")}
                >
                  <PencilIcon className="size-3.5 mr-2" />
                  スライドスタジオ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onGenerateSlides(getMessageText(message), "simple")}
                >
                  <FileTextIcon className="size-3.5 mr-2" />
                  簡易スライド
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
