"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatSettingsStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  MessageSquareIcon,
  FileTextIcon,
  SparklesIcon,
  PinIcon,
  PinOffIcon,
  BotIcon,
  XIcon,
  Trash2Icon,
  PlusIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// useIsDesktop hook
// ---------------------------------------------------------------------------

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: "/new", icon: PlusIcon, label: "新規チャット" },
  { href: "/documents", icon: FileTextIcon, label: "ドキュメント" },
  { href: "/skills", icon: SparklesIcon, label: "スキル" },
] as const;

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

interface ChatItem {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

function groupByDate(items: ChatItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ChatItem[] }[] = [
    { label: "今日", items: [] },
    { label: "昨日", items: [] },
    { label: "過去7日間", items: [] },
    { label: "それ以前", items: [] },
  ];

  for (const item of items) {
    const d = new Date(item.updated_at);
    if (d >= today) groups[0].items.push(item);
    else if (d >= yesterday) groups[1].items.push(item);
    else if (d >= weekAgo) groups[2].items.push(item);
    else groups[3].items.push(item);
  }

  return groups.filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// SidebarInner — shared navigation for both modes
// ---------------------------------------------------------------------------

function SidebarInner({ onClose }: { onClose?: () => void }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sidebarPinned = useChatSettingsStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useChatSettingsStore(
    (s) => s.toggleSidebarPinned,
  );
  const setSidebarOpen = useChatSettingsStore((s) => s.setSidebarOpen);

  // Fetch chat history
  const { data: historyData } = useQuery({
    queryKey: ["chat-history"],
    queryFn: async () => {
      const res = await fetch("/api/history/chats?limit=50");
      if (!res.ok) return { conversations: [] };
      return res.json() as Promise<{ conversations: ChatItem[] }>;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const conversations = historyData?.conversations ?? [];
  const groups = groupByDate(conversations);

  const handleNav = useCallback(
    (href: string) => {
      router.push(href);
      if (!sidebarPinned) {
        setSidebarOpen(false);
      }
    },
    [router, sidebarPinned, setSidebarOpen],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation();
      try {
        await fetch(`/api/history/chats/${chatId}`, { method: "DELETE" });
        queryClient.invalidateQueries({ queryKey: ["chat-history"] });
        // If we're viewing the deleted chat, navigate to /new
        if (pathname === `/chat/${chatId}`) {
          router.push("/new");
        }
      } catch (err) {
        console.error("Failed to delete chat:", err);
      }
    },
    [queryClient, pathname, router],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <BotIcon className="size-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold tracking-tight">RAG Chat</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="サイドバーを閉じる"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/new"
              ? pathname === "/new"
              : pathname.startsWith(item.href);
          return (
            <button
              key={item.href}
              onClick={() => handleNav(item.href)}
              className={`
                flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
                ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }
              `}
            >
              <item.icon
                className={`size-4 shrink-0 ${isActive ? "text-primary" : ""}`}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Chat History */}
      {conversations.length > 0 && (
        <>
          <Separator />
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((chat) => {
                    const isActive = pathname === `/chat/${chat.id}`;
                    return (
                      <button
                        key={chat.id}
                        onClick={() => handleNav(`/chat/${chat.id}`)}
                        className={`
                          group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
                          ${
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }
                        `}
                      >
                        <MessageSquareIcon className="size-3.5 shrink-0 opacity-50" />
                        <span className="flex-1 truncate text-left">
                          {chat.title}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => handleDelete(e, chat.id)}
                          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5"
                          aria-label="削除"
                        >
                          <Trash2Icon className="size-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer — pin toggle (desktop only) */}
      {isDesktop && (
        <>
          <Separator />
          <div className="px-2 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebarPinned}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {sidebarPinned ? (
                    <PinOffIcon className="size-4 shrink-0" />
                  ) : (
                    <PinIcon className="size-4 shrink-0" />
                  )}
                  {sidebarPinned ? "固定解除" : "サイドバーを固定"}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarPinned ? "固定解除" : "サイドバーを固定"}
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar — dual-mode (overlay Sheet / pinned aside)
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const isDesktop = useIsDesktop();
  const sidebarOpen = useChatSettingsStore((s) => s.sidebarOpen);
  const sidebarPinned = useChatSettingsStore((s) => s.sidebarPinned);
  const setSidebarOpen = useChatSettingsStore((s) => s.setSidebarOpen);
  const setSidebarPinned = useChatSettingsStore((s) => s.setSidebarPinned);

  // Hydrate pinned state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-pinned");
    if (stored === "true") {
      setSidebarPinned(true);
      setSidebarOpen(true);
    }
  }, [setSidebarPinned, setSidebarOpen]);

  const showPinned = isDesktop && sidebarPinned && sidebarOpen;

  return (
    <>
      {/* Pinned: inline aside, pushes content */}
      {showPinned && (
        <aside className="hidden md:flex w-56 shrink-0 h-dvh flex-col glass-sidebar border-r border-border">
          <SidebarInner />
        </aside>
      )}

      {/* Overlay: Sheet */}
      <Sheet
        open={showPinned ? false : sidebarOpen}
        onOpenChange={setSidebarOpen}
      >
        <SheetContent
          side="left"
          className="w-56 sm:max-w-56 p-0 flex flex-col"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>ナビゲーション</SheetTitle>
            <SheetDescription>ページ切替</SheetDescription>
          </SheetHeader>
          <SidebarInner onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
