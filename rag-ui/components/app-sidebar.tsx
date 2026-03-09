"use client";

import { useEffect, useState } from "react";
import { useChatSettingsStore, type SidebarSection } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  MessagesSquareIcon,
  FileTextIcon,
  SparklesIcon,
  PinIcon,
  PinOffIcon,
  BotIcon,
} from "lucide-react";
import { DocumentsSection } from "@/components/documents-section";
import { SkillsSection } from "@/components/skills-section";

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
// Tab config
// ---------------------------------------------------------------------------

const TABS: { value: SidebarSection; icon: typeof FileTextIcon; label: string }[] = [
  { value: "history", icon: MessagesSquareIcon, label: "履歴" },
  { value: "documents", icon: FileTextIcon, label: "ドキュメント" },
  { value: "skills", icon: SparklesIcon, label: "スキル" },
];

// ---------------------------------------------------------------------------
// SidebarInner — shared content for both modes
// ---------------------------------------------------------------------------

function SidebarInner({ showPinToggle }: { showPinToggle: boolean }) {
  const sidebarPinned = useChatSettingsStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useChatSettingsStore((s) => s.toggleSidebarPinned);
  const sidebarSection = useChatSettingsStore((s) => s.sidebarSection);
  const setSidebarSection = useChatSettingsStore((s) => s.setSidebarSection);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <BotIcon className="size-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold tracking-tight">RAG Chat</h2>
        {showPinToggle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={toggleSidebarPinned}
                aria-label={sidebarPinned ? "サイドバーを解除" : "サイドバーを固定"}
              >
                {sidebarPinned ? (
                  <PinOffIcon className="size-3.5" />
                ) : (
                  <PinIcon className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {sidebarPinned ? "固定解除" : "サイドバーを固定"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Separator />

      {/* Tabs */}
      <div className="px-2 pt-2">
        <Tabs
          value={sidebarSection}
          onValueChange={(v) => setSidebarSection(v as SidebarSection)}
        >
          <TabsList className="w-full">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 gap-1.5 text-xs"
              >
                <tab.icon className="size-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Separator className="mt-2" />

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col min-h-0">
          {sidebarSection === "history" && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <MessagesSquareIcon className="size-8 opacity-40" />
              <p>チャット履歴</p>
              <p className="text-xs">今後実装予定</p>
            </div>
          )}
          {sidebarSection === "documents" && <DocumentsSection />}
          {sidebarSection === "skills" && <SkillsSection />}
        </div>
      </ScrollArea>
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
        <aside className="hidden md:flex w-72 shrink-0 h-dvh flex-col glass-sidebar border-r border-border">
          <SidebarInner showPinToggle />
        </aside>
      )}

      {/* Overlay: Sheet */}
      <Sheet open={showPinned ? false : sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 sm:max-w-72 p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>サイドバー</SheetTitle>
            <SheetDescription>ナビゲーション</SheetDescription>
          </SheetHeader>
          <SidebarInner showPinToggle={isDesktop} />
        </SheetContent>
      </Sheet>
    </>
  );
}
