"use client";

import { useCallback, useState } from "react";
import type { FileUIPart } from "ai";
import type { useChat } from "@ai-sdk/react";
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
import { XIcon, FileTextIcon, FileIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Attachment preview (uses PromptInput's local attachments context)
// ---------------------------------------------------------------------------

function AttachmentPreviewHeader() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <div className="flex flex-wrap gap-2 px-1">
        {attachments.files.map((file) => {
          const isImage = file.mediaType?.startsWith("image/");
          return (
            <div
              key={file.id}
              className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              {isImage && file.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.url}
                  alt={file.filename ?? "image"}
                  className="size-8 rounded object-cover"
                />
              ) : file.mediaType === "application/pdf" ? (
                <FileIcon className="size-4 text-red-400" />
              ) : (
                <FileTextIcon className="size-4 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate text-muted-foreground">
                {file.filename ?? "file"}
              </span>
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
  const isLoading = status === "submitted" || status === "streaming";
  const hasContent = !!inputText.trim() || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={!hasContent && !isLoading}
    />
  );
}

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES = [
  "image/*",
  "text/*",
  "application/pdf",
].join(",");

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.currentTarget.value);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5">
      <PromptInput
        onSubmit={handleSubmit}
        accept={ACCEPTED_TYPES}
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
          </PromptInputTools>
          <ChatSubmitButton status={status} inputText={input} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
