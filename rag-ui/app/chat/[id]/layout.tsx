import type { Metadata } from "next";
import { getConversationTitle } from "@/lib/chat-db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const title = await getConversationTitle(id);
  return {
    title: title || "チャット",
    description: "AI アシスタントとの会話。",
  };
}

export default function ChatIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
