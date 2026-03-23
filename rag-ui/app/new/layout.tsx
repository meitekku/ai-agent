import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規チャット",
  description:
    "AI アシスタントと対話。ナレッジベース検索、ウェブ検索、CRM 分析、画像生成などを活用できます。",
};

export default function NewChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
