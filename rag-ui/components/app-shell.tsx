"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ChatHeader } from "@/components/chat-header";

export function AppShell({
  children,
  initialSidebarPinned,
}: {
  children: React.ReactNode;
  initialSidebarPinned: boolean;
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AppSidebar initialPinned={initialSidebarPinned} />
      <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden">
        <ChatHeader />
        {children}
      </div>
    </div>
  );
}
