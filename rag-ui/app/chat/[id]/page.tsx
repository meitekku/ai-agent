"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatPage } from "@/components/chat-page";
import type { ConversationRow, MessageRow } from "@/lib/chat-db";
import { Spinner } from "@/components/ui/spinner";

export default function ChatByIdPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<{
    conversation: ConversationRow;
    messages: MessageRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on id change
    setError(null);
    fetch(`/api/history/chats/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Not found (${res.status})`);
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          チャットが見つかりませんでした
        </p>
      </div>
    );
  }

  return <ChatPage key={id} conversationId={id} initialData={data} />;
}
