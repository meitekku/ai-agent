"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChatSettingsStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  MessageSquareIcon,
  FileTextIcon,
  SparklesIcon,
  PinIcon,
  PinOffIcon,
  BotIcon,
  XIcon,
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
  { href: "/new", icon: MessageSquareIcon, label: "新規チャット" },
  { href: "/documents", icon: FileTextIcon, label: "ドキュメント" },
  { href: "/skills", icon: SparklesIcon, label: "スキル" },
] as const;

// ---------------------------------------------------------------------------
// SidebarInner — shared navigation for both modes
// ---------------------------------------------------------------------------

function SidebarInner({ onClose }: { onClose?: () => void }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const sidebarPinned = useChatSettingsStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useChatSettingsStore((s) => s.toggleSidebarPinned);
  const setSidebarOpen = useChatSettingsStore((s) => s.setSidebarOpen);

  const handleNav = useCallback(
    (href: string) => {
      router.push(href);
      // Overlay mode: close after navigation. Pinned mode: stay open.
      if (!sidebarPinned) {
        setSidebarOpen(false);
      }
    },
    [router, sidebarPinned, setSidebarOpen],
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
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <button
              key={item.href}
              onClick={() => handleNav(item.href)}
              className={`
                flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
                ${isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }
              `}
            >
              <item.icon className={`size-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

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

      {/* Overlay: Sheet (hide default close button, we handle it ourselves) */}
      <Sheet open={showPinned ? false : sidebarOpen} onOpenChange={setSidebarOpen}>
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
