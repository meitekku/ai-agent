"use client";

import { Button } from "@/components/ui/button";
import { PanelLeftIcon, BotIcon } from "lucide-react";

export function ChatHeader({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="glass-header sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="サイドバーを開閉"
        aria-expanded={sidebarOpen}
      >
        <PanelLeftIcon className="size-4" />
      </Button>
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <BotIcon className="size-3.5 text-primary" />
        </div>
        <h1 className="text-sm font-semibold tracking-tight">RAG Chat</h1>
      </div>
      <span className="text-[11px] text-muted-foreground/70 ml-1 hidden sm:inline">
        ナレッジベースに基づいて回答します
      </span>
    </header>
  );
}
