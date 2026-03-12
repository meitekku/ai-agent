"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatSettingsStore } from "@/lib/store";
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
  MessageSquareIcon,
  FileTextIcon,
  SparklesIcon,
  XIcon,
  Trash2Icon,
  PlusIcon,
} from "lucide-react";
import { AppLogo } from "@/components/icons/app-logo";

// ---------------------------------------------------------------------------
// Persist sidebar state to cookie + DB (fire-and-forget)
// ---------------------------------------------------------------------------

function persistSidebarState(open: boolean) {
  document.cookie = `sidebar-open=${open}; path=/; max-age=31536000; SameSite=Lax`;
  fetch("/api/ui-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sidebarOpen: open }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: "/new", icon: PlusIcon, label: "新規チャット" },
  { href: "/documents", icon: FileTextIcon, label: "ナレッジベース" },
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
// SidebarInner
// ---------------------------------------------------------------------------

function SidebarInner({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

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
          <AppLogo className="size-4 text-foreground" />
        </div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Stella
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex size-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="サイドバーを閉じる"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <Separator />

      {/* Navigation — clicking does NOT close sidebar */}
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
              }}
              className={`
                flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
                ${
                  isActive
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
                }
              `}
            >
              <item.icon
                className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-foreground/50"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Chat History — clicking does NOT close sidebar */}
      {conversations.length > 0 && (
        <>
          <Separator />
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-[11px] font-medium text-foreground/40 uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((chat) => {
                    const isActive = pathname === `/chat/${chat.id}`;
                    return (
                      <Link
                        key={chat.id}
                        href={`/chat/${chat.id}`}
                        className={`
                          group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
                          ${
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
                          }
                        `}
                      >
                        <MessageSquareIcon className="size-3.5 shrink-0 opacity-60" />
                        <span className="flex-1 truncate text-left">
                          {chat.title}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteTarget({ id: chat.id, title: chat.title });
                          }}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>チャットを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}
              」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar — slide open/close, state persisted to cookie + DB
// ---------------------------------------------------------------------------

export function AppSidebar({ initialOpen }: { initialOpen: boolean }) {
  const sidebarOpen = useChatSettingsStore((s) => s.sidebarOpen);
  const setSidebarOpen = useChatSettingsStore((s) => s.setSidebarOpen);

  // Hydrate Zustand from server cookie value (once on mount)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setSidebarOpen(initialOpen);
  }, [initialOpen, setSidebarOpen]);

  // Before hydration use server value; after, use Zustand
  const isOpen = hydratedRef.current ? sidebarOpen : initialOpen;

  const handleClose = useCallback(() => {
    setSidebarOpen(false);
    persistSidebarState(false);
  }, [setSidebarOpen]);

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={handleClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto h-dvh w-56 shrink-0 flex-col glass-sidebar border-r border-border
          transition-all duration-200 ease-in-out
          ${isOpen ? "flex translate-x-0" : "-translate-x-full md:-ml-56 hidden"}
        `}
      >
        <SidebarInner onClose={handleClose} />
      </aside>
    </>
  );
}
