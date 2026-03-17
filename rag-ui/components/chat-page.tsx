"use client";

import { useChat } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import { isToolUIPart, getToolName } from "ai";
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
import { SlidePanel } from "@/components/slide-panel";
import { SlideSetupWizard, type WizardConfig } from "@/components/slide-setup-wizard";
import type { SlideDeck } from "@/lib/slide-types";
import { AnimatePresence } from "motion/react";
import { BookOpenIcon, ZapIcon, AlertCircleIcon, ImageIcon } from "lucide-react";
import { StepIndicator } from "@/components/step-indicator";
import { useChatSettingsStore, isImageModel } from "@/lib/store";
import { useSlideStore } from "@/lib/slide-store";
import { useSlidePanelStore } from "@/lib/slide-panel-store";
import { useChatTreeStore } from "@/lib/chat-tree";
import { useProposalPanelStore } from "@/lib/proposal-panel-store";
import { ProposalPanel } from "@/components/proposal-panel";
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

function getClientTime(): string {
  return new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

export function ChatPage({
  conversationId: initialConvId,
  initialData,
}: ChatPageProps) {
  const service = useChatSettingsStore((s) => s.service);
  const activeKb = useChatSettingsStore((s) => s.activeKb);
  const setActiveKb = useChatSettingsStore((s) => s.setActiveKb);
  const chatModel = useChatSettingsStore((s) => s.chatModel);
  const recordMessageMeta = useChatSettingsStore((s) => s.recordMessageMeta);
  const setChatTitle = useChatSettingsStore((s) => s.setChatTitle);
  const chatTitle = useChatSettingsStore((s) => s.chatTitle);
  const queryClient = useQueryClient();

  // Init chat title from loaded conversation
  useEffect(() => {
    setChatTitle(initialData?.conversation.title ?? "");
    return () => {
      setChatTitle("");
    };
  }, [initialData?.conversation.title, setChatTitle]);

  // Sync document.title
  useEffect(() => {
    document.title = chatTitle ? `${chatTitle} | Stella` : "Stella";
    return () => {
      document.title = "Stella";
    };
  }, [chatTitle]);

  // Tree store
  const treeStore = useChatTreeStore();
  const convIdRef = useRef<string | null>(initialConvId);
  const initializedRef = useRef(false);
  // Track the parent ID for new user messages (set before sendMessage)
  const pendingParentRef = useRef<string | null>(null);
  // Track count of messages known before sending, to find new ones
  const knownCountRef = useRef(0);
  // Track whether the user stopped the response
  const stoppedRef = useRef(false);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
  } = useChat({
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
      // Restore KB selection from conversation
      if (initialData.conversation.kb_slug) {
        setActiveKb(initialData.conversation.kb_slug);
      }
    } else {
      treeStore.clear();
    }
  }, [initialConvId, initialData, treeStore, setMessages, setActiveKb]);

  const isLoading = status === "submitted" || status === "streaming";
  const setImageGenerating = useChatSettingsStore((s) => s.setImageGenerating);

  // Track imageGenerating state for navigation guard
  useEffect(() => {
    const generating = isLoading && isImageModel(chatModel);
    setImageGenerating(generating);
    return () => setImageGenerating(false);
  }, [isLoading, chatModel, setImageGenerating]);

  // Prevent browser navigation during image generation
  useEffect(() => {
    if (!isLoading || !isImageModel(chatModel)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isLoading, chatModel]);

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    stop();
  }, [stop]);


  // Slide panel (declared early so effects can reference it)
  const openSlidePanel = useSlidePanelStore((s) => s.openPanel);

  // Refs for slide tool detection (must be before both effects that use them)
  const sessionActiveRef = useRef(false);
  const justFinishedRef = useRef(false);

  // Persist messages when streaming finishes
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasLoading =
      prevStatusRef.current === "submitted" ||
      prevStatusRef.current === "streaming";
    prevStatusRef.current = status;

    if (!wasLoading || status !== "ready") return;

    // Signal the slide tool detection effect
    justFinishedRef.current = true;

    if (messages.length === 0) return;

    const convId = convIdRef.current;
    if (!convId) return;

    const known = knownCountRef.current;
    const newMsgs = messages.slice(known);
    knownCountRef.current = messages.length;
    if (newMsgs.length === 0) return;

    const parentId = pendingParentRef.current;
    pendingParentRef.current = null;

    // Check if the response was stopped by the user
    const wasStopped = stoppedRef.current;
    stoppedRef.current = false;

    // Build save list with parent chain
    const toSave: {
      id: string;
      parent_id: string | null;
      role: string;
      parts: unknown[];
      stopped?: boolean;
    }[] = [];
    for (let i = 0; i < newMsgs.length; i++) {
      const msg = newMsgs[i];
      const pid = i === 0 ? parentId : newMsgs[i - 1].id;
      const isLastAssistant =
        wasStopped && i === newMsgs.length - 1 && msg.role === "assistant";
      toSave.push({
        id: msg.id,
        parent_id: pid,
        role: msg.role,
        parts: msg.parts as unknown[],
        ...(isLastAssistant ? { stopped: true } : {}),
      });
    }

    // Add to tree store
    treeStore.addMessages(
      toSave.map((m) => ({
        id: m.id,
        parentId: m.parent_id,
        role: m.role,
        parts: m.parts as unknown[],
        stopped: m.stopped,
      })),
    );

    // Persist to DB
    const leafId = toSave[toSave.length - 1].id;
    const isFirstExchange = known === 0;
    fetch(`/api/history/chats/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toSave, active_leaf_id: leafId }),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["chat-history"] });
        // Generate AI title after first exchange
        if (isFirstExchange) {
          fetch(`/api/history/chats/${convId}/generate-title`, {
            method: "POST",
          })
            .then(async (res) => {
              if (res.ok) {
                const { title } = await res.json();
                if (title) setChatTitle(title);
              }
              queryClient.invalidateQueries({ queryKey: ["chat-history"] });
            })
            .catch(() => {});
        }
      })
      .catch((e) => console.error("[chat-page] save failed:", e));
  }, [status, messages, treeStore, queryClient]);

  // Detect generateSlides / generateProposal tool result
  const openProposal = useProposalPanelStore((s) => s.open);
  useEffect(() => {
    if (!sessionActiveRef.current) return;
    if (!justFinishedRef.current) return;
    justFinishedRef.current = false;

    const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
    if (!lastAssistant) return;

    for (const part of lastAssistant.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const toolName = getToolName(part);
      const result = (("result" in part ? part.result : part.output) ?? {}) as Record<string, unknown>;

      if (toolName === "generateSlides" && result?.triggered) {
        setWizardData({
          topic: (result.topic as string) ?? "",
          content: (result.content as string) ?? "",
          instructions: (result.instructions as string | null) ?? null,
        });
        break;
      }

      if (toolName === "generateProposal" && result?.triggered) {
        openProposal(
          result.data as Record<string, unknown>,
          result.analysis as Record<string, unknown>,
          result.additionalContext as string | undefined,
        );
        break;
      }
    }
  }, [status, messages, openProposal]);

  // Create conversation on first send
  const ensureConversation = useCallback(
    async (firstText: string) => {
      if (convIdRef.current) return convIdRef.current;
      const id = nanoid();
      convIdRef.current = id;
      const title = generateTitle(firstText);
      setChatTitle(title);

      // Create in DB first, then update URL
      try {
        await fetch("/api/history/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, title, kb_slug: activeKb }),
        });
      } catch (e) {
        console.error("[chat-page] create conversation failed:", e);
      }
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });

      // Update URL to /chat/[id] without re-mounting the component
      window.history.replaceState(null, "", `/chat/${id}`);

      return id;
    },
    [queryClient, activeKb],
  );

  const handleSend = useCallback(
    async (text: string, files?: FileUIPart[]) => {
      sessionActiveRef.current = true;

      await ensureConversation(text || "ファイル添付");

      // Track parent for the new user message
      const currentLeaf = treeStore.activeLeafId;
      pendingParentRef.current = currentLeaf;
      knownCountRef.current = messages.length;

      const body = { service, kb: activeKb, clientTime: getClientTime(), model: chatModel };
      if (files && files.length > 0) {
        sendMessage({ text, files }, { body });
      } else {
        sendMessage({ text }, { body });
      }
    },
    [
      sendMessage,
      service,
      activeKb,
      chatModel,
      ensureConversation,
      treeStore.activeLeafId,
      messages.length,
    ],
  );

  const handleRegenerate = useCallback(() => {
    // For regeneration, the new assistant will have the same parent as the current last assistant
    // which is the user message before it
    const lastUserIdx = messages.length >= 2 ? messages.length - 2 : -1;
    pendingParentRef.current =
      lastUserIdx >= 0 ? messages[lastUserIdx].id : null;
    // Remove the last assistant message from known count since it will be replaced
    knownCountRef.current = messages.length - 1;
    regenerate({ body: { service, kb: activeKb, clientTime: getClientTime(), model: chatModel } });
  }, [regenerate, service, activeKb, chatModel, messages]);

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

      pendingParentRef.current = parentId;
      knownCountRef.current = truncated.length;

      // Send new message (creates new user+assistant pair as siblings of the edited message)
      sendMessage({ text: newText }, { body: { service, kb: activeKb, clientTime: getClientTime(), model: chatModel } });
    },
    [treeStore, setMessages, sendMessage, service, activeKb, chatModel],
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

  // --- Slide Setup Wizard ---
  const [wizardData, setWizardData] = useState<{
    topic: string;
    content: string;
    instructions: string | null;
  } | null>(null);

  const handleWizardComplete = useCallback(
    (config: WizardConfig) => {
      const styleOptions: import("@/components/style-options-panel").StyleOptions = {};
      if (config.industries.length > 0) styleOptions.industry = config.industries[0];
      if (config.audience.length > 0) {
        // Check if it's a profession or age group
        const professions = config.audience.filter((a) =>
          ["人事", "営業", "経営企画", "マーケティング", "管理・経理", "設計・開発", "研究・R&D", "カスタマーサポート", "コンサルティング"].includes(a),
        );
        const ages = config.audience.filter((a) =>
          ["10代〜20代", "30代〜40代", "50代以上", "全年代"].includes(a),
        );
        if (professions.length > 0) styleOptions.profession = professions[0];
        if (ages.length > 0) styleOptions.ageGroup = ages[0];
      }
      if (config.colorStyle) styleOptions.colorStyle = config.colorStyle;

      // Build instructions with wizard selections
      const parts: string[] = [];
      if (config.industries.length > 0)
        parts.push(`産業: ${config.industries.join(", ")}`);
      if (config.audience.length > 0)
        parts.push(`対象者: ${config.audience.join(", ")}`);
      if (config.colorStyle)
        parts.push(`配色: ${config.colorStyle}`);
      if (config.slideCount)
        parts.push(`枚数: ${config.slideCount}枚`);
      if (config.additionalNotes)
        parts.push(config.additionalNotes);

      const mergedInstructions = [
        wizardData?.instructions,
        ...parts,
      ]
        .filter(Boolean)
        .join("\n");

      openSlidePanel(
        config.topic || wizardData?.topic || "",
        wizardData?.content || "",
        mergedInstructions || null,
        Object.keys(styleOptions).length > 0 ? styleOptions : null,
      );
      setWizardData(null);
    },
    [wizardData, openSlidePanel],
  );

  const handleWizardCancel = useCallback(() => {
    setWizardData(null);
  }, []);

  // --- SlidePanel (right panel for HTML slides) ---
  const slidePanelOpen = useSlidePanelStore((s) => s.open);
  const slidePanelSourceId = useSlidePanelStore((s) => s.sourceMessageId);
  const reopenSlidePanel = useSlidePanelStore((s) => s.reopenPanel);

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
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("")
      : "";
  }, [messages]);

  const handleGenerateSlides = useCallback(
    (answerText: string, mode: "html" | "visual" | "studio" | "simple", messageId?: string) => {
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
          openSlidePanel(question, answerText, null, null, messageId ?? null);
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
    [getQuestion, openSlideViewer, openSlidePanel],
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
    <div className="flex flex-1 overflow-hidden">
      <Conversation className="flex-1 min-w-0">
        <ConversationContent className="min-h-full !gap-0 !p-0">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-radial-glow">
              {emptyStateIcon}
              <div className="space-y-1">
                <h3 className="font-medium text-sm">AI チャットへようこそ</h3>
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
                    createdAt={treeStore.nodes[message.id]?.createdAt}
                    stopped={treeStore.nodes[message.id]?.stopped}
                    onCopy={handleCopy}
                    onRegenerate={handleRegenerate}
                    onGenerateSlides={(text, mode) => handleGenerateSlides(text, mode, message.id)}
                    onEdit={message.role === "user" ? handleEdit : undefined}
                    branchInfo={branchInfo}
                    onSwitchBranch={handleSwitchBranch}
                    slidePanelSourceId={slidePanelSourceId}
                    onReopenSlides={reopenSlidePanel}
                  />
                );
              })}
              {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" ? (
                <Message from="assistant">
                  <MessageContent>
                    {isImageModel(chatModel) ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ImageIcon className="size-3.5 animate-pulse" />
                          <span className="animate-pulse">画像を生成中...</span>
                        </div>
                        <div className="h-64 w-80 animate-pulse rounded-xl bg-muted/40 border border-border/30" />
                      </div>
                    ) : (
                      <StepIndicator
                        icon={ZapIcon}
                        activeLabel="考え中..."
                        completedLabel="処理完了"
                        active
                      />
                    )}
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
              <AnimatePresence>
                {wizardData && (
                  <SlideSetupWizard
                    topic={wizardData.topic}
                    content={wizardData.content}
                    instructions={wizardData.instructions}
                    onComplete={handleWizardComplete}
                    onCancel={handleWizardCancel}
                  />
                )}
              </AnimatePresence>
              <ChatInput status={status} onSend={handleSend} onStop={handleStop} />
            </div>
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Slide Panel (right side) */}
      {slidePanelOpen && <SlidePanel />}

      {/* Modal Slide Viewers (non-html modes) */}
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
      <ProposalPanel />
    </div>
  );
}
