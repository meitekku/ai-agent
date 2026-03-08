"use client";

import { useCallback, useState } from "react";
import type { useChat } from "@ai-sdk/react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
} from "@/components/ai-elements/prompt-input";

export function ChatInput({
  status,
  onSend,
  onStop,
}: {
  status: ReturnType<typeof useChat>["status"];
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    ({ text }: { text: string }) => {
      if (!text.trim()) return;
      onSend(text);
      setInput("");
    },
    [onSend],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.currentTarget.value);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5">
      <PromptInput onSubmit={handleSubmit} accept="application/pdf" className="transition-shadow duration-300 focus-within:glow-ring rounded-xl">
        <PromptInputTextarea
          value={input}
          onChange={handleChange}
          placeholder="ナレッジベースに質問する..."
          disabled={isLoading}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger tooltip="添付ファイル" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="PDF を追加" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          <PromptInputSubmit
            status={status}
            onStop={onStop}
            disabled={!input.trim() && !isLoading}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
