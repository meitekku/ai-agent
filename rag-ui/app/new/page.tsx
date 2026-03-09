"use client";

import { ChatPage } from "@/components/chat-page";
import { useChatSettingsStore } from "@/lib/store";

export default function NewChatPage() {
  const resetKey = useChatSettingsStore((s) => s.chatResetCounter);
  return <ChatPage key={resetKey} conversationId={null} />;
}
