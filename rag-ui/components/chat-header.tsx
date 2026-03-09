"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PanelLeftIcon, BotIcon, FileTextIcon, SparklesIcon, MessageSquareIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useChatSettingsStore } from "@/lib/store";

const VIEW_CONFIG: Record<string, { icon: typeof BotIcon; title: string; subtitle: string }> = {
  "/new": { icon: BotIcon, title: "RAG Chat", subtitle: "ナレッジベースに基づいて回答します" },
  "/documents": { icon: FileTextIcon, title: "ドキュメント", subtitle: "ナレッジベースの管理" },
  "/skills": { icon: SparklesIcon, title: "スキル", subtitle: "AI の回答をカスタマイズ" },
};

export function ChatHeader() {
  const pathname = usePathname();
  const sidebarOpen = useChatSettingsStore((s) => s.sidebarOpen);
  const toggleSidebar = useChatSettingsStore((s) => s.toggleSidebar);

  const config =
    Object.entries(VIEW_CONFIG).find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    VIEW_CONFIG["/new"];
  const ViewIcon = config.icon;

  return (
    <header className="glass-header sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleSidebar}
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
        <h1 className="text-sm font-semibold tracking-tight">{config.title}</h1>
      </div>
      <span className="text-[11px] text-muted-foreground/70 ml-1 hidden sm:inline">
        {config.subtitle}
      </span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
