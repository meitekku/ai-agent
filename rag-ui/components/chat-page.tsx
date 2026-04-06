"use client";

import { useChat } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import { isToolUIPart, getToolName } from "ai";
import { useCallback, useEffect, useRef } from "react";
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
import {
  BookOpenIcon,
  AlertCircleIcon,
  FactoryIcon,
  BriefcaseIcon,
  ShoppingCartIcon,
  Building2Icon,
  HeartPulseIcon,
  DatabaseIcon,
} from "lucide-react";
import type { SuggestionCardData } from "@/components/ai-elements/suggestion";
import {
  SuggestionCard,
  SuggestionCards,
} from "@/components/ai-elements/suggestion";
import { useChatSettingsStore } from "@/lib/store";
import { useChatTreeStore } from "@/lib/chat-tree";
import { useArtifactStore } from "@/lib/artifact-store";
import dynamic from "next/dynamic";
import type { MessageRow, ConversationRow } from "@/lib/chat-db";

const AnimatedArtifactPanel = dynamic(
  () =>
    import("@/components/artifact-panel").then((m) => m.AnimatedArtifactPanel),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Hoisted static elements
// ---------------------------------------------------------------------------

const emptyStateIcon = (
  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
    <BookOpenIcon className="size-6 text-primary" />
  </div>
);

const DEMO_SUGGESTIONS: SuggestionCardData[] = [
  {
    title: "Kintone 商談デモ",
    description:
      "CRM連携デモ：Kintoneの商談一覧を取得し、AI分析→提案書を自動生成",
    prompt: "Kintoneの商談一覧を見せてください",
    icon: <DatabaseIcon className="size-4" />,
  },
  {
    title: "製造業：社内ナレッジAI",
    description:
      "技術文書が散在、ベテラン退職でノウハウ流出。RAG検索+業務DXを提案",
    prompt: `山田製造株式会社の商談を分析して提案書を作ってください。
会社: 山田製造株式会社（製造業、従業員500名）
案件: 社内ナレッジ検索AI導入（予算1500万円）
課題: 20年分の技術文書・設計図面が社内サーバーに散在し検索に時間がかかる。ベテラン技術者の退職が相次ぎ暗黙知の共有が急務。新人教育も非効率。`,
    icon: <FactoryIcon className="size-4" />,
  },
  {
    title: "不動産：会議録AI自動化",
    description:
      "30拠点の営業会議・顧客商談の議事録を手作業で作成。音声→自動文字起こし",
    prompt: `三井不動産リアルティの商談を分析して提案書を作ってください。
会社: 三井不動産リアルティ株式会社（不動産業、従業員3000名）
案件: 営業会議録AI自動化サービス導入（予算1200万円）
課題: 30拠点の営業会議・顧客商談の議事録を担当者が手作業で作成。1件あたり平均2時間かかり、記録漏れや属人化が深刻。音声文字起こし＋AI要約で効率化したい。`,
    icon: <Building2Icon className="size-4" />,
  },
  {
    title: "医療法人：DX基盤構築",
    description:
      "5施設の紙カルテ・報告書をデジタル化。AI検索＋業務プロセスDXを推進",
    prompt: `医療法人恵仁会の商談を分析して提案書を作ってください。
会社: 医療法人恵仁会（医療・介護、施設数5、職員800名）
案件: DX基盤構築＋AI活用推進プロジェクト（予算3000万円）
課題: 紙ベースのカルテ・報告書・マニュアルが大量に残存。施設間での情報共有ができず、同じ質問が繰り返し発生。医療安全情報やプロトコルの検索にも時間がかかる。`,
    icon: <HeartPulseIcon className="size-4" />,
  },
  {
    title: "人材業：マッチング効率化",
    description:
      "求職者と求人の照合が属人的。AIマッチング＋過去成約事例のRAG検索を提案",
    prompt: `グローバル人材サービスの商談を分析して提案書を作ってください。
会社: グローバル人材サービス株式会社（人材紹介業、従業員120名）
案件: AI求人マッチングシステム導入（予算800万円）
課題: 年間5,000件の求人と20,000名の求職者の照合をコンサルタントが手動で実施。経験豊富な社員と新人で成約率に3倍の差。過去の成約事例・ノウハウが共有されていない。`,
    icon: <BriefcaseIcon className="size-4" />,
  },
  {
    title: "小売業：顧客対応AI",
    description:
      "月間15,000件の問い合わせの70%が定型質問。24時間AIチャットボットを構築",
    prompt: `さくらリテールの商談を分析して提案書を作ってください。
会社: さくらリテール株式会社（小売業・アパレル、全国50店舗）
案件: AIチャットボット＋ナレッジベース構築（予算600万円）
課題: ECと実店舗の問い合わせが月間15,000件、うち70%が在庫・サイズ・返品ポリシーの定型質問。コールセンター30名体制だが人手不足で応答率80%。営業時間外の機会損失も大きい。`,
    icon: <ShoppingCartIcon className="size-4" />,
  },
];

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

function ArtifactPanelWrapper() {
  return <AnimatedArtifactPanel />;
}

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

function generateTitle(): string {
  return "新しい会話";
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
  const thinking = useChatSettingsStore((s) => s.thinking);
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
    document.title = chatTitle
      ? `${chatTitle} | FleGrowth Stella`
      : "FleGrowth Stella";
    return () => {
      document.title = "FleGrowth Stella";
    };
  }, [chatTitle]);

  // Tree store
  const treeStore = useChatTreeStore();
  const convIdRef = useRef<string | null>(initialConvId);
  const initializedRef = useRef(false);
  // The model/thinking values last written to DB — persist effect only fires
  // when the closure values diverge from these (prevents stale writes on load)
  const dbModelRef = useRef<string | null>(null);
  const dbThinkingRef = useRef<boolean | null>(null);
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
    onData: (part: any) => {
      if (part?.type === "data-artifact") {
        const { event, ...data } = part.data ?? {};
        if (event === "create") {
          useArtifactStore.getState().openArtifact(data);
          useArtifactStore.getState().upsertArtifactListItem({
            id: data.id,
            title: data.title,
            kind: data.kind,
            currentVersion: data.version,
          });
        } else if (event === "update" || event === "rewrite") {
          useArtifactStore.getState().updateArtifact({ ...data, command: event });
          if (data.id) {
            useArtifactStore.getState().upsertArtifactListItem({
              id: data.id,
              title: data.title || useArtifactStore.getState().title,
              kind: data.kind || useArtifactStore.getState().kind,
              currentVersion: data.version,
            });
          }
        }
      }
    },
  });

  // Restore artifact panel + artifact list for existing conversations
  useEffect(() => {
    useArtifactStore.getState().reset();
    if (!initialConvId) return;
    const controller = new AbortController();
    // Fetch latest artifact (for panel restore) and all artifacts (for list)
    Promise.all([
      fetch(`/api/artifacts?conversationId=${initialConvId}`, {
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `/api/artifacts?conversationId=${initialConvId}&list=true`,
        { signal: controller.signal },
      ).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([, list]) => {
        if (controller.signal.aborted) return;
        if (Array.isArray(list) && list.length > 0) {
          useArtifactStore.getState().setArtifactList(list);
        }
        // Don't auto-open panel on conversation restore — just load the list
      })
      .catch(() => {});
    return () => controller.abort();
  }, [initialConvId]);

  // Stream artifact content progressively as the LLM generates tool input
  useEffect(() => {
    if (status !== "streaming") {
      // When streaming ends, finalize
      if (useArtifactStore.getState().isStreaming) {
        useArtifactStore.getState().finalizeStreaming();
      }
      return;
    }
    // Scan the last assistant message for artifact tool in partial-call state
    const lastMsg = messages.findLast((m) => m.role === "assistant");
    if (!lastMsg) return;
    for (const part of lastMsg.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== "artifact") continue;
      if (part.state === "input-streaming") {
        const input = (part as any).input as Record<string, unknown> | undefined;
        if (input?.content && typeof input.content === "string" && input.content.length > 20) {
          useArtifactStore.getState().setStreaming({
            title: typeof input.title === "string" ? input.title : undefined,
            kind: typeof input.kind === "string" ? input.kind : undefined,
            language: typeof input.language === "string" ? input.language : undefined,
            content: input.content,
          });
        }
      }
    }
  }, [messages, status]);

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
      // Restore model / thinking from conversation — record the DB values
      // so the persist effect knows not to write them back
      const restoredModel =
        initialData.conversation.chat_model || "gemini-3-flash-preview";
      const restoredThinking = initialData.conversation.thinking ?? false;
      dbModelRef.current = restoredModel;
      dbThinkingRef.current = restoredThinking;
      useChatSettingsStore.getState().setChatModel(restoredModel);
      useChatSettingsStore.getState().setThinking(restoredThinking);
    } else {
      treeStore.clear();
      dbModelRef.current = "gemini-3-flash-preview";
      dbThinkingRef.current = true;
      useChatSettingsStore.getState().setChatModel("gemini-3-flash-preview");
      useChatSettingsStore.getState().setThinking(true);
    }
  }, [initialConvId, initialData, treeStore, setMessages, setActiveKb]);

  // Persist model / thinking changes to DB — only for genuine user changes.
  // After init restore, the closure may hold stale values from the previous
  // render while the store already has the restored values. Guard against
  // this by comparing with both the DB snapshot and the live store.
  useEffect(() => {
    const convId = convIdRef.current;
    if (!convId || !initializedRef.current) return;
    // Already in DB — nothing to persist
    if (chatModel === dbModelRef.current && thinking === dbThinkingRef.current)
      return;
    // Closure is stale (store was updated by init but component hasn't re-rendered)
    const store = useChatSettingsStore.getState();
    if (chatModel !== store.chatModel || thinking !== store.thinking) return;
    dbModelRef.current = chatModel;
    dbThinkingRef.current = thinking;
    fetch(`/api/history/chats/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_model: chatModel, thinking }),
    }).catch(() => {});
  }, [chatModel, thinking]);

  const isLoading = status === "submitted" || status === "streaming";

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    stop();
  }, [stop]);

  // Sync tree store & UI when streaming finishes (DB save is now server-side)
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasLoading =
      prevStatusRef.current === "submitted" ||
      prevStatusRef.current === "streaming";
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

    // Check if the response was stopped by the user
    const wasStopped = stoppedRef.current;
    stoppedRef.current = false;

    // Build message list with parent chain for tree store
    const toAdd: {
      id: string;
      parentId: string | null;
      role: string;
      parts: unknown[];
      stopped?: boolean;
    }[] = [];
    for (let i = 0; i < newMsgs.length; i++) {
      const msg = newMsgs[i];
      const pid = i === 0 ? parentId : newMsgs[i - 1].id;
      const isLastAssistant =
        wasStopped && i === newMsgs.length - 1 && msg.role === "assistant";
      toAdd.push({
        id: msg.id,
        parentId: pid,
        role: msg.role,
        parts: msg.parts as unknown[],
        ...(isLastAssistant ? { stopped: true } : {}),
      });
    }

    // Add to tree store (local state for branching UI)
    treeStore.addMessages(toAdd);

    // Persist to DB (convert camelCase parentId → snake_case parent_id for API)
    const toSave = toAdd.map((m) => ({
      id: m.id,
      parent_id: m.parentId,
      role: m.role,
      parts: m.parts,
      ...(m.stopped ? { stopped: true } : {}),
    }));
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
  }, [status, messages, treeStore, queryClient, setChatTitle]);

  // Create conversation on first send
  const ensureConversation = useCallback(
    async () => {
      if (convIdRef.current) return convIdRef.current;
      const id = nanoid();
      convIdRef.current = id;
      const title = generateTitle();
      setChatTitle(title);

      // Create in DB first, then update URL
      try {
        await fetch("/api/history/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            title,
            kb_slug: activeKb,
            chat_model: chatModel,
            thinking,
          }),
        });
      } catch (e) {
        console.error("[chat-page] create conversation failed:", e);
      }
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });

      // Update URL to /chat/[id] without re-mounting the component
      window.history.replaceState(null, "", `/chat/${id}`);

      return id;
    },
    [queryClient, activeKb, chatModel, thinking, setChatTitle],
  );

  const handleSend = useCallback(
    async (text: string, files?: FileUIPart[]) => {
      await ensureConversation();

      // Track parent for the new user message
      const currentLeaf = treeStore.activeLeafId;
      pendingParentRef.current = currentLeaf;
      knownCountRef.current = messages.length;

      const body = {
        service,
        kb: activeKb,
        clientTime: getClientTime(),
        model: chatModel,
        chatId: convIdRef.current,
        parentId: currentLeaf,
        thinking,
      };
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
      thinking,
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
    const regenParentId = lastUserIdx >= 0 ? messages[lastUserIdx].id : null;

    regenerate({
      body: {
        service,
        kb: activeKb,
        clientTime: getClientTime(),
        model: chatModel,
        chatId: convIdRef.current,
        parentId: regenParentId,
        thinking,
      },
    });
  }, [
    regenerate,
    service,
    activeKb,
    chatModel,
    thinking,
    messages,
  ]);

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
      sendMessage(
        { text: newText },
        {
          body: {
            service,
            kb: activeKb,
            clientTime: getClientTime(),
            model: chatModel,
            chatId: convId,
            parentId,
            thinking,
          },
        },
      );
    },
    [
      treeStore,
      setMessages,
      sendMessage,
      service,
      activeKb,
      chatModel,
      thinking,
    ],
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
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 pb-32 text-center bg-radial-glow">
              {emptyStateIcon}
              <div className="space-y-1">
                <h3 className="font-medium text-sm">AI チャットへようこそ</h3>
                <p className="text-muted-foreground text-sm">
                  何でも質問してください。ナレッジベースやウェブ検索を自動的に活用して回答します。
                </p>
              </div>
              <SuggestionCards className="mt-2 max-w-3xl">
                {DEMO_SUGGESTIONS.map((s) => (
                  <SuggestionCard key={s.title} data={s} onClick={handleSend} />
                ))}
              </SuggestionCards>
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
                    onEdit={message.role === "user" ? handleEdit : undefined}
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
                    <div className="flex items-center gap-1 py-1">
                      <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                    </div>
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
              <ChatInput
                status={status}
                onSend={handleSend}
                onStop={handleStop}
              />
            </div>
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ArtifactPanelWrapper />
    </div>
  );
}
