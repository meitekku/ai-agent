"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const incrementChatReset = useChatSettingsStore((s) => s.incrementChatReset);

  // Fetch chat history
  const { data: historyData } = useQuery({
    queryKey: ["chat-history"],
    queryFn: async () => {
      const res = await fetch("/api/history/chats?limit=50");
      if (!res.ok) return { conversations: [] as ChatItem[] };
      return res.json() as Promise<{ conversations: ChatItem[] }>;
    },
    refetchInterval: 30000,
  });

  const conversations = historyData?.conversations ?? [];
  const groups = groupByDate(conversations);

  const handleTogglePin = useCallback(() => {
    const next = !sidebarPinned;
    toggleSidebarPinned();
    document.cookie = `sidebar-pinned=${next}; path=/; max-age=31536000; SameSite=Lax`;
    fetch("/api/ui-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sidebarPinned: next }),
    }).catch(() => {});
  }, [sidebarPinned, toggleSidebarPinned]);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const chatId = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await fetch(`/api/history/chats/${chatId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });
      if (pathname === `/chat/${chatId}`) {
        router.push("/new");
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }, [deleteTarget, queryClient, pathname, router]);

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
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (item.href === "/new") incrementChatReset();
                if (!sidebarPinned) setSidebarOpen(false);
              }}
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
            </Link>
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
                      <Link
                        key={chat.id}
                        href={`/chat/${chat.id}`}
                        onClick={() => { if (!sidebarPinned) setSidebarOpen(false); }}
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
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: chat.id, title: chat.title }); }}
                          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5"
                          aria-label="削除"
                        >
                          <Trash2Icon className="size-3" />
                        </span>
                      </Link>
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
                  onClick={handleTogglePin}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>チャットを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar — dual-mode (overlay Sheet / pinned aside)
// ---------------------------------------------------------------------------

export function AppSidebar({ initialPinned }: { initialPinned: boolean }) {
  const isDesktop = useIsDesktop();
  const sidebarOpen = useChatSettingsStore((s) => s.sidebarOpen);
  const sidebarPinned = useChatSettingsStore((s) => s.sidebarPinned);
  const setSidebarOpen = useChatSettingsStore((s) => s.setSidebarOpen);
  const setSidebarPinned = useChatSettingsStore((s) => s.setSidebarPinned);

  // Hydrate Zustand from server cookie value (once on mount)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (initialPinned) {
      setSidebarPinned(true);
      setSidebarOpen(true);
    }
  }, [initialPinned, setSidebarPinned, setSidebarOpen]);

  // Before hydration use server value; after, use Zustand
  const effectivePinned = hydratedRef.current ? sidebarPinned : initialPinned;

  return (
    <>
      {/* Pinned: CSS hidden md:flex handles desktop visibility */}
      {effectivePinned && (
        <aside className="hidden md:flex w-56 shrink-0 h-dvh flex-col glass-sidebar border-r border-border">
          <SidebarInner />
        </aside>
      )}

      {/* Overlay: on mobile or when not pinned */}
      <Sheet
        open={isDesktop && effectivePinned ? false : sidebarOpen}
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
