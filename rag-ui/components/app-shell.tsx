"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ChatHeader } from "@/components/chat-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden">
        <ChatHeader />
        {children}
      </div>
    </div>
  );
}
