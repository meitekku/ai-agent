"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  PanelLeftIcon,
  BotIcon,
  FileTextIcon,
  SparklesIcon,
  MessageSquareIcon,
  NetworkIcon,
  CalendarClockIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { useChatSettingsStore } from "@/lib/store";

const VIEW_CONFIG: Record<
  string,
  { icon: typeof BotIcon; title: string; subtitle: string }
> = {
  "/chat": {
    icon: MessageSquareIcon,
    title: "FleGrowth Sales Assist",
    subtitle: "ナレッジベースに基づいて回答します",
  },
  "/new": {
    icon: BotIcon,
    title: "FleGrowth Sales Assist",
    subtitle: "ナレッジベースに基づいて回答します",
  },
  "/documents": {
    icon: FileTextIcon,
    title: "ドキュメント",
    subtitle: "ナレッジベースの管理",
  },
  "/skills": {
    icon: SparklesIcon,
    title: "スキル",
    subtitle: "AI の回答をカスタマイズ",
  },
  "/graph": {
    icon: NetworkIcon,
    title: "ナレッジグラフ",
    subtitle: "エンティティ関係の3D可視化",
  },
  "/scheduler": {
    icon: CalendarClockIcon,
    title: "スケジューラ",
    subtitle: "定時タスクの管理",
  },
};

function persistSidebarState(open: boolean) {
  document.cookie = `sidebar-open=${open}; path=/; max-age=31536000; SameSite=Lax`;
  fetch("/api/ui-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sidebarOpen: open }),
  }).catch(() => {});
}

export function ChatHeader() {
  const pathname = usePathname();
  const sidebarOpen = useChatSettingsStore((s) => s.sidebarOpen);
  const toggleSidebar = useChatSettingsStore((s) => s.toggleSidebar);

  const handleToggle = useCallback(() => {
    const next = !useChatSettingsStore.getState().sidebarOpen;
    toggleSidebar();
    persistSidebarState(next);
  }, [toggleSidebar]);

  const chatTitle = useChatSettingsStore((s) => s.chatTitle);

  const isChat = pathname.startsWith("/chat") || pathname.startsWith("/new");
  const config =
    Object.entries(VIEW_CONFIG).find(([prefix]) =>
      pathname.startsWith(prefix),
    )?.[1] ?? VIEW_CONFIG["/new"];
  const ViewIcon = config.icon;
  const displayTitle = isChat && chatTitle ? chatTitle : config.title;
  const displaySubtitle = isChat && chatTitle ? "" : config.subtitle;

  return (
    <header className="glass-header sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleToggle}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="サイドバーを開閉"
        aria-expanded={sidebarOpen}
      >
        <PanelLeftIcon className="size-4" />
      </Button>
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <ViewIcon className="size-3.5 text-primary" />
        </div>
        <h1 className="text-sm font-semibold tracking-tight truncate max-w-[200px] sm:max-w-[400px]">
          {displayTitle}
        </h1>
      </div>
      {displaySubtitle && (
        <span className="text-[11px] text-muted-foreground/70 ml-1 hidden sm:inline">
          {displaySubtitle}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
