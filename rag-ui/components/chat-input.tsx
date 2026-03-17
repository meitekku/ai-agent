"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";
import type { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  XIcon,
  FileTextIcon,
  FileIcon,
  DatabaseIcon,
  XCircleIcon,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  CheckIcon,
} from "lucide-react";
import { useChatSettingsStore, GEMINI_MODELS } from "@/lib/store";
import { useFileUpload } from "@/hooks/use-file-upload";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBListItem {
  slug: string;
  name: string;
  title: string;
  doc_count: number;
}

// ---------------------------------------------------------------------------
// Attachment preview with upload progress
// ---------------------------------------------------------------------------

function AttachmentPreviewHeader() {
  const attachments = usePromptInputAttachments();
  const { uploadState, retryUpload } = useFileUpload(
    attachments.files,
    attachments.updateUrl,
  );

  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <div className="flex flex-wrap gap-2 px-1">
        {attachments.files.map((file) => {
          const isImage = file.mediaType?.startsWith("image/");
          const state = uploadState[file.id];
          const progress = state?.progress ?? (file.url?.startsWith("blob:") ? 0 : 100);
          const hasError = progress === -1;
          const isUploading = progress >= 0 && progress < 100;

          return (
            <div
              key={file.id}
              className="group/att relative"
            >
              {/* Thumbnail / icon */}
              {isImage && file.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.url}
                  alt={file.filename ?? "image"}
                  className={`size-14 rounded-lg object-cover border ${
                    hasError ? "border-destructive/40" : "border-border"
                  }`}
                />
              ) : (
                <div
                  className={`flex size-14 items-center justify-center rounded-lg border ${
                    hasError
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border bg-muted/40"
                  }`}
                >
                  {file.mediaType === "application/pdf" ? (
                    <FileIcon className="size-6 text-red-400" />
                  ) : (
                    <FileTextIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Upload progress overlay */}
              {isUploading && (
                <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-black/20">
                  <div
                    className="h-full bg-primary/80 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {/* Upload spinner overlay */}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
                  <Loader2Icon className="size-4 animate-spin text-white" />
                </div>
              )}

              {/* Error retry overlay */}
              {hasError && (
                <button
                  type="button"
                  onClick={() => retryUpload(file.id)}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-destructive/10 transition-colors hover:bg-destructive/20"
                  aria-label="再試行"
                >
                  <RotateCcwIcon className="size-4 text-destructive" />
                </button>
              )}

              {/* Remove button — visible on hover */}
              <button
                type="button"
                onClick={() => attachments.remove(file.id)}
                className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-background border border-border p-0.5 text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/att:block"
                aria-label="削除"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </PromptInputHeader>
  );
}

// ---------------------------------------------------------------------------
// Submit button wrapper (needs access to attachments context)
// ---------------------------------------------------------------------------

function ChatSubmitButton({
  status,
  inputText,
  onStop,
}: {
  status: ReturnType<typeof useChat>["status"];
  inputText: string;
  onStop: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const isLoading = status === "submitted" || status === "streaming";
  const hasContent = !!inputText.trim() || attachments.files.length > 0;
  // Check if all files are uploaded (non-blob URLs)
  const allUploaded = attachments.files.every(
    (f) => !f.url?.startsWith("blob:"),
  );

  return (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={(!hasContent && !isLoading) || (!allUploaded && !isLoading)}
    />
  );
}

// ---------------------------------------------------------------------------
// KB Selector
// ---------------------------------------------------------------------------

function KBSelector({ disabled }: { disabled: boolean }) {
  const activeKb = useChatSettingsStore((s) => s.activeKb);
  const setActiveKb = useChatSettingsStore((s) => s.setActiveKb);
  const [open, setOpen] = useState(false);

  const { data: kbs = [] } = useQuery<KBListItem[]>({
    queryKey: ["kbs"],
    queryFn: async () => {
      const res = await fetch("/api/kbs");
      if (!res.ok) return [];
      const data = await res.json();
      return data.knowledge_bases || [];
    },
    staleTime: 30_000,
  });

  const selectedKb = kbs.find((k) => k.slug === activeKb);

  const hasKbs = kbs.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && hasKbs && setOpen(!open)}
        disabled={disabled || !hasKbs}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
          activeKb
            ? "bg-primary/10 text-primary ring-1 ring-primary/20"
            : hasKbs
              ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              : "text-muted-foreground/50 cursor-not-allowed"
        } ${disabled ? "opacity-50 cursor-not-allowed" : hasKbs ? "cursor-pointer" : ""}`}
        aria-label="ナレッジベース選択"
      >
        <DatabaseIcon className="size-3.5" />
        <span className="max-w-[140px] truncate">
          {selectedKb
            ? selectedKb.name
            : hasKbs
              ? "すべてのナレッジベース"
              : "ナレッジベースなし"}
        </span>
        {activeKb && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveKb(null);
              setOpen(false);
            }}
            className="ml-0.5 rounded-full p-0.5 text-primary/60 hover:text-primary"
            aria-label="ナレッジベース選択を解除"
          >
            <XCircleIcon className="size-3" />
          </button>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute bottom-full left-0 z-50 mb-1.5 min-w-[200px] max-w-[280px] rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setActiveKb(null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                !activeKb
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <span className="text-muted-foreground">—</span>
              <span>すべて（自動選択）</span>
            </button>
            {kbs.map((kb) => (
              <button
                key={kb.slug}
                type="button"
                onClick={() => {
                  setActiveKb(kb.slug);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  activeKb === kb.slug
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                <DatabaseIcon className="size-3 shrink-0 text-primary/70" />
                <span className="truncate">{kb.name}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {kb.doc_count}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Selector
// ---------------------------------------------------------------------------

function ModelSelector({ disabled }: { disabled: boolean }) {
  const chatModel = useChatSettingsStore((s) => s.chatModel);
  const setChatModel = useChatSettingsStore((s) => s.setChatModel);
  const [open, setOpen] = useState(false);

  const selected = GEMINI_MODELS.find((m) => m.id === chatModel);
  const displayLabel = selected ? selected.label : GEMINI_MODELS[0].label;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
          chatModel
            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-label="モデル選択"
      >
        <SparklesIcon className="size-3.5" />
        <span>{displayLabel}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 min-w-[220px] rounded-lg border border-border bg-popover p-1 shadow-lg">
            {GEMINI_MODELS.map((model) => {
              const isSelected = chatModel === model.id || (!chatModel && model.id === GEMINI_MODELS[0].id);
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setChatModel(model.id === GEMINI_MODELS[0].id ? null : model.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <SparklesIcon className="size-3 shrink-0 text-violet-500/70" />
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-[10px] text-muted-foreground">{model.description}</span>
                  </div>
                  {isSelected && (
                    <CheckIcon className="ml-auto size-3 shrink-0 text-violet-500" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES = ["image/*", "text/*", "application/pdf"].join(",");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function ChatInput({
  status,
  onSend,
  onStop,
}: {
  status: ReturnType<typeof useChat>["status"];
  onSend: (text: string, files?: FileUIPart[]) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  // Global drag enter/leave tracking for drop zone highlight
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCountRef.current++;
        setIsDragging(true);
      }
    };
    const onDragLeave = () => {
      dragCountRef.current--;
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0;
        setIsDragging(false);
      }
    };
    const onDrop = () => {
      dragCountRef.current = 0;
      setIsDragging(false);
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  const handleSubmit = useCallback(
    ({ text, files }: { text: string; files: FileUIPart[] }) => {
      const hasText = !!text.trim();
      const hasFiles = files.length > 0;
      if (!hasText && !hasFiles) return;
      onSend(text, hasFiles ? files : undefined);
      setInput("");
    },
    [onSend],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.currentTarget.value);
    },
    [],
  );

  const handleError = useCallback(
    (err: { code: string; message: string }) => {
      console.warn("[chat-input] file error:", err.code, err.message);
    },
    [],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5">
      <PromptInput
        onSubmit={handleSubmit}
        accept={ACCEPTED_TYPES}
        maxFileSize={MAX_FILE_SIZE}
        onError={handleError}
        multiple
        globalDrop
        className={`transition-all duration-300 rounded-xl ${
          isDragging
            ? "ring-2 ring-primary/50 border-primary/40 bg-primary/5"
            : "focus-within:glow-ring"
        }`}
      >
        <AttachmentPreviewHeader />
        <PromptInputTextarea
          value={input}
          onChange={handleChange}
          placeholder="メッセージを入力..."
        />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger tooltip="添付ファイル" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="画像・ファイルを追加" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <KBSelector disabled={false} />
            <ModelSelector disabled={false} />
          </PromptInputTools>
          <ChatSubmitButton status={status} inputText={input} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
