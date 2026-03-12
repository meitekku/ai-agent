"use client";

import { useCallback, useState } from "react";
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
  AlertCircleIcon,
  Loader2Icon,
} from "lucide-react";
import { useChatSettingsStore } from "@/lib/store";
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
  const { uploadState } = useFileUpload(
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
          const sizeLabel = state?.sizeLabel;

          return (
            <div
              key={file.id}
              className={`group relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                hasError
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-muted/40"
              }`}
            >
              {/* Thumbnail / icon */}
              {isImage && file.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.url}
                  alt={file.filename ?? "image"}
                  className="size-12 rounded object-cover"
                />
              ) : file.mediaType === "application/pdf" ? (
                <FileIcon className="size-5 text-red-400" />
              ) : (
                <FileTextIcon className="size-5 text-muted-foreground" />
              )}

              {/* File info */}
              <div className="flex flex-col gap-0.5">
                <span className="max-w-[120px] truncate text-muted-foreground">
                  {file.filename ?? "file"}
                </span>
                {sizeLabel && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {sizeLabel}
                  </span>
                )}
                {hasError && (
                  <span className="flex items-center gap-1 text-[10px] text-destructive">
                    <AlertCircleIcon className="size-2.5" />
                    {state?.error ?? "エラー"}
                  </span>
                )}
              </div>

              {/* Upload progress overlay */}
              {isUploading && (
                <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-muted">
                  <div
                    className="h-full bg-primary/60 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {/* Upload spinner */}
              {isUploading && (
                <Loader2Icon className="size-3 animate-spin text-primary/60" />
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={() => attachments.remove(file.id)}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
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
  const { allUploaded } = useFileUpload(
    attachments.files,
    attachments.updateUrl,
  );
  const isLoading = status === "submitted" || status === "streaming";
  const hasContent = !!inputText.trim() || attachments.files.length > 0;

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

  if (kbs.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
          activeKb
            ? "bg-primary/10 text-primary ring-1 ring-primary/20"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-label="ナレッジベース選択"
      >
        <DatabaseIcon className="size-3.5" />
        <span className="max-w-[120px] truncate">
          {selectedKb ? selectedKb.name : "ナレッジベース"}
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
              <span>なし</span>
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
  const isLoading = status === "submitted" || status === "streaming";

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
        className="transition-shadow duration-300 focus-within:glow-ring rounded-xl"
      >
        <AttachmentPreviewHeader />
        <PromptInputTextarea
          value={input}
          onChange={handleChange}
          placeholder="メッセージを入力..."
          disabled={isLoading}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger tooltip="添付ファイル" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="画像・ファイルを追加" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <KBSelector disabled={isLoading} />
          </PromptInputTools>
          <ChatSubmitButton status={status} inputText={input} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
