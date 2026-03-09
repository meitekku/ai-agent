"use client";

import { useChat } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useQueryClient } from "@tanstack/react-query";
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
import { useChatTreeStore } from "@/lib/chat-tree";
import type { MessageRow, ConversationRow } from "@/lib/chat-db";

// ---------------------------------------------------------------------------
// Hoisted static elements
// ---------------------------------------------------------------------------

const emptyStateIcon = (
  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
    <BookOpenIcon className="size-6 text-primary" />
  </div>
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatPageProps {
  conversationId: string | null;
  initialData?: {
    conversation: ConversationRow;
    messages: MessageRow[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTitle(text: string): string {
  // Take first 50 chars, cut at last word boundary
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 50) return trimmed;
  const cut = trimmed.slice(0, 50);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

// ---------------------------------------------------------------------------
// ChatPage
// ---------------------------------------------------------------------------

export function ChatPage({ conversationId: initialConvId, initialData }: ChatPageProps) {
  const service = useChatSettingsStore((s) => s.service);
  const recordMessageMeta = useChatSettingsStore((s) => s.recordMessageMeta);
  const queryClient = useQueryClient();

  // Tree store
  const treeStore = useChatTreeStore();
  const convIdRef = useRef<string | null>(initialConvId);
  const initializedRef = useRef(false);
  // Track the parent ID for new user messages (set before sendMessage)
  const pendingParentRef = useRef<string | null>(null);
  // Track count of messages known before sending, to find new ones
  const knownCountRef = useRef(0);

  const { messages, setMessages, sendMessage, status, stop, regenerate, error } =
    useChat({
      id: initialConvId ?? "new-chat",
      experimental_throttle: 50,
    });

  // Load initial data into tree AND sync to useChat
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (initialData && initialConvId) {
      treeStore.loadTree(initialConvId, initialData.messages);
      if (initialData.conversation.active_leaf_id) {
        treeStore.setActiveLeafId(initialData.conversation.active_leaf_id);
      }
      const path = treeStore.getActivePath();
      setMessages(path);
      knownCountRef.current = path.length;
    } else {
      treeStore.clear();
    }
  }, [initialConvId, initialData, treeStore, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";
  const submitTimeRef = useRef(0);

  // Persist messages when streaming finishes
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasLoading =
      prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming";
    prevStatusRef.current = status;

    if (!wasLoading || status !== "ready") return;
    if (messages.length === 0) return;

    const convId = convIdRef.current;
    if (!convId) return;

    const known = knownCountRef.current;
    const newMsgs = messages.slice(known);
    knownCountRef.current = messages.length;
    if (newMsgs.length === 0) return;

    const parentId = pendingParentRef.current;
    pendingParentRef.current = null;

    // Build save list with parent chain
    const toSave: { id: string; parent_id: string | null; role: string; parts: unknown[] }[] = [];
    for (let i = 0; i < newMsgs.length; i++) {
      const msg = newMsgs[i];
      const pid = i === 0 ? parentId : newMsgs[i - 1].id;
      toSave.push({
        id: msg.id,
        parent_id: pid,
        role: msg.role,
        parts: msg.parts as unknown[],
      });
    }

    // Add to tree store
    treeStore.addMessages(
      toSave.map((m) => ({
        id: m.id,
        parentId: m.parent_id,
        role: m.role,
        parts: m.parts as unknown[],
      })),
    );

    // Persist to DB
    const leafId = toSave[toSave.length - 1].id;
    fetch(`/api/history/chats/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toSave, active_leaf_id: leafId }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["chat-history"] }))
      .catch((e) => console.error("[chat-page] save failed:", e));
  }, [status, messages, treeStore, queryClient]);

  // Create conversation on first send
  const ensureConversation = useCallback(
    async (firstText: string) => {
      if (convIdRef.current) return convIdRef.current;
      const id = nanoid();
      convIdRef.current = id;
      const title = generateTitle(firstText);

      // Create in DB (URL stays at /new to avoid Next.js re-mount)
      fetch("/api/history/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["chat-history"] }))
        .catch((e) => console.error("[chat-page] create conversation failed:", e));

      return id;
    },
    [queryClient],
  );

  const handleSend = useCallback(
    async (text: string, files?: FileUIPart[]) => {
      submitTimeRef.current = Date.now();
      await ensureConversation(text || "ファイル添付");

      // Track parent for the new user message
      const currentLeaf = treeStore.activeLeafId;
      pendingParentRef.current = currentLeaf;
      knownCountRef.current = messages.length;

      if (files && files.length > 0) {
        sendMessage({ text, files }, { body: { service } });
      } else {
        sendMessage({ text }, { body: { service } });
      }
    },
    [sendMessage, service, ensureConversation, treeStore.activeLeafId, messages.length],
  );

  const handleRegenerate = useCallback(() => {
    submitTimeRef.current = Date.now();
    // For regeneration, the new assistant will have the same parent as the current last assistant
    // which is the user message before it
    const lastUserIdx = messages.length >= 2 ? messages.length - 2 : -1;
    pendingParentRef.current = lastUserIdx >= 0 ? messages[lastUserIdx].id : null;
    // Remove the last assistant message from known count since it will be replaced
    knownCountRef.current = messages.length - 1;
    regenerate({ body: { service, skipCache: true } });
  }, [regenerate, service, messages]);

  // Edit message: create new branch
  const handleEdit = useCallback(
    async (messageId: string, newText: string) => {
      const convId = convIdRef.current;
      if (!convId) return;

      // Find the message in tree to get its parent
      const node = treeStore.nodes[messageId];
      if (!node) return;

      const parentId = node.parentId;

      // Build messages up to (but not including) the edited message
      const path = treeStore.getActivePath();
      const editIndex = path.findIndex((m) => m.id === messageId);
      if (editIndex < 0) return;

      const truncated = path.slice(0, editIndex);
      setMessages(truncated);

      // Track parent for the new user message
      submitTimeRef.current = Date.now();
      pendingParentRef.current = parentId;
      knownCountRef.current = truncated.length;

      // Send new message (creates new user+assistant pair as siblings of the edited message)
      sendMessage({ text: newText }, { body: { service } });
    },
    [treeStore, setMessages, sendMessage, service],
  );

  // Branch switching
  const handleSwitchBranch = useCallback(
    (nodeId: string) => {
      const newPath = treeStore.switchBranch(nodeId);
      setMessages(newPath);

      // Persist active_leaf_id
      const convId = convIdRef.current;
      const leafId = treeStore.activeLeafId;
      if (convId && leafId) {
        fetch(`/api/history/chats/${convId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_leaf_id: leafId }),
        }).catch(() => {});
      }
    },
    [treeStore, setMessages],
  );

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
  const [studioDeck, setStudioDeck] = useState<SlideDeck>({
    title: "",
    slides: [],
  });
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Helper: extract question from messages
  const getQuestion = useCallback(() => {
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    return lastUserMsg
      ? lastUserMsg.parts
          .filter(
            (p): p is { type: "text"; text: string } => p.type === "text",
          )
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
              setStudioError(
                err instanceof Error ? err.message : "Failed to generate deck",
              );
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
        setStudioError(
          err instanceof Error ? err.message : "Refine failed",
        );
      } finally {
        setStudioBusy(false);
      }
    },
    [studioDeck],
  );

  // Branch helpers for ChatMessage
  const getBranchInfo = useCallback(
    (messageId: string) => {
      const nodes = treeStore.nodes;
      if (!nodes[messageId]) return null;
      const { index, total } = treeStore.getSiblingIndex(messageId);
      if (total <= 1) return null;
      return { index, total, siblings: treeStore.getSiblings(messageId) };
    },
    [treeStore],
  );

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="min-h-full !gap-0 !p-0">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-radial-glow">
              {emptyStateIcon}
              <div className="space-y-1">
                <h3 className="font-medium text-sm">
                  AI チャットへようこそ
                </h3>
                <p className="text-muted-foreground text-sm">
                  何でも質問してください。ナレッジベースやウェブ検索を自動的に活用して回答します。
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-8 flex flex-col gap-8">
              {messages.map((message, idx) => {
                const isActive =
                  isLoading &&
                  message.role === "assistant" &&
                  idx === messages.length - 1;
                const branchInfo = getBranchInfo(message.id);
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLoading={isLoading}
                    isActiveStreaming={isActive}
                    submitTime={isActive ? submitTimeRef.current : undefined}
                    createdAt={treeStore.nodes[message.id]?.createdAt}
                    onCopy={handleCopy}
                    onRegenerate={handleRegenerate}
                    onGenerateSlides={handleGenerateSlides}
                    onEdit={
                      message.role === "user" ? handleEdit : undefined
                    }
                    branchInfo={branchInfo}
                    onSwitchBranch={handleSwitchBranch}
                  />
                );
              })}
              {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" ? (
                <Message from="assistant">
                  <MessageContent>
                    <StepIndicator
                      icon={ZapIcon}
                      activeLabel="考え中..."
                      completedLabel="処理完了"
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
