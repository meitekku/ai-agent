"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { SlideViewer } from "@/components/slide-viewer";
import { VisualSlideViewer } from "@/components/visual-slide-viewer";
import { HtmlSlideViewer } from "@/components/html-slide-viewer";
import { SlideStudio } from "@/components/slide-studio";
import type { SlideDeck } from "@/lib/slide-types";
import { BookOpenIcon, ZapIcon, AlertCircleIcon } from "lucide-react";
import { StepIndicator } from "@/components/step-indicator";
import { useChatSettingsStore } from "@/lib/store";
import { useSlideStore } from "@/lib/slide-store";

// ---------------------------------------------------------------------------
// Hoisted static elements
// ---------------------------------------------------------------------------

const emptyStateIcon = (
  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
    <BookOpenIcon className="size-6 text-primary" />
  </div>
);

// ---------------------------------------------------------------------------
// ChatPage
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const service = useChatSettingsStore((s) => s.service);
  const recordMessageMeta = useChatSettingsStore((s) => s.recordMessageMeta);

  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    experimental_throttle: 50,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const submitTimeRef = useRef(0);

  const handleSend = useCallback(
    (text: string) => {
      submitTimeRef.current = Date.now();
      sendMessage({ text }, { body: { service } });
    },
    [sendMessage, service],
  );

  const handleRegenerate = useCallback(() => {
    submitTimeRef.current = Date.now();
    regenerate({ body: { service, skipCache: true } });
  }, [regenerate, service]);

  // Record metadata when a new assistant message appears
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      recordMessageMeta(last.id);
    }
  }, [messages, recordMessageMeta]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // --- Simple SlideViewer (existing) ---
  const openSlideViewer = useSlideStore((s) => s.openSlideViewer);

  // --- VisualSlideViewer state ---
  const [visualOpen, setVisualOpen] = useState(false);
  const [visualQuestion, setVisualQuestion] = useState("");
  const [visualAnswer, setVisualAnswer] = useState("");

  // --- HtmlSlideViewer state ---
  const [htmlSlideOpen, setHtmlSlideOpen] = useState(false);
  const [htmlSlideQuestion, setHtmlSlideQuestion] = useState("");
  const [htmlSlideAnswer, setHtmlSlideAnswer] = useState("");

  // --- SlideStudio state ---
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioDeck, setStudioDeck] = useState<SlideDeck>({ title: "", slides: [] });
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Helper: extract question from messages
  const getQuestion = useCallback(() => {
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    return lastUserMsg
      ? lastUserMsg.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("")
      : "";
  }, [messages]);

  const handleGenerateSlides = useCallback(
    (answerText: string, mode: "html" | "visual" | "studio" | "simple") => {
      const question = getQuestion();

      switch (mode) {
        case "simple":
          openSlideViewer(question, answerText);
          break;

        case "visual":
          setVisualQuestion(question);
          setVisualAnswer(answerText);
          setVisualOpen(true);
          break;

        case "html":
          setHtmlSlideQuestion(question);
          setHtmlSlideAnswer(answerText);
          setHtmlSlideOpen(true);
          break;

        case "studio": {
          setStudioBusy(true);
          setStudioError(null);
          setStudioOpen(true);
          setStudioDeck({ title: "生成中...", slides: [] });

          fetch("/api/slides/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              answer: answerText,
              max_slides: 10,
            }),
          })
            .then(async (res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();
              setStudioDeck(data.deck);
            })
            .catch((err) => {
              setStudioError(err instanceof Error ? err.message : "Failed to generate deck");
            })
            .finally(() => {
              setStudioBusy(false);
            });
          break;
        }
      }
    },
    [getQuestion, openSlideViewer],
  );

  const handleStudioRefine = useCallback(
    async (instruction: string) => {
      setStudioBusy(true);
      setStudioError(null);
      try {
        const res = await fetch("/api/slides/refine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deck: studioDeck, instruction }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStudioDeck(data.deck);
      } catch (err) {
        setStudioError(err instanceof Error ? err.message : "Refine failed");
      } finally {
        setStudioBusy(false);
      }
    },
    [studioDeck],
  );

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="min-h-full !gap-0 !p-0">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-radial-glow">
              {emptyStateIcon}
              <div className="space-y-1">
                <h3 className="font-medium text-sm">RAG チャットへようこそ</h3>
                <p className="text-muted-foreground text-sm">
                  ナレッジベースに質問してみましょう。サイドバーからドキュメントをアップロードできます。
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-8 flex flex-col gap-8">
              {messages.map((message, idx) => {
                const isActive =
                  isLoading && message.role === "assistant" && idx === messages.length - 1;
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLoading={isLoading}
                    isActiveStreaming={isActive}
                    submitTime={isActive ? submitTimeRef.current : undefined}
                    onCopy={handleCopy}
                    onRegenerate={handleRegenerate}
                    onGenerateSlides={handleGenerateSlides}
                  />
                );
              })}
              {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" ? (
                <Message from="assistant">
                  <MessageContent>
                    <StepIndicator
                      icon={ZapIcon}
                      activeLabel="検索・生成中..."
                      completedLabel="検索・生成完了"
                      active
                    />
                  </MessageContent>
                </Message>
              ) : null}
              {error ? (
                <div className="animate-fade-in-up flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircleIcon className="size-4 shrink-0" />
                  <span>エラーが発生しました: {error.message}</span>
                </div>
              ) : null}
            </div>
          )}
          <div className="sticky bottom-0 z-30 mt-auto">
            <div className="pointer-events-none h-8 bg-gradient-to-t from-background to-transparent" />
            <div className="bg-background">
              <ChatInput status={status} onSend={handleSend} onStop={stop} />
            </div>
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Slide Viewers */}
      <SlideViewer />
      <VisualSlideViewer
        open={visualOpen}
        question={visualQuestion}
        answer={visualAnswer}
        onClose={() => setVisualOpen(false)}
      />
      <HtmlSlideViewer
        open={htmlSlideOpen}
        question={htmlSlideQuestion}
        answer={htmlSlideAnswer}
        onClose={() => setHtmlSlideOpen(false)}
      />
      <SlideStudio
        open={studioOpen}
        deck={studioDeck}
        busy={studioBusy}
        error={studioError}
        onClose={() => setStudioOpen(false)}
        onDeckChange={setStudioDeck}
        onRequestRefine={handleStudioRefine}
      />
    </>
  );
}
