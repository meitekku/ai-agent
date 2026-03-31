"use client";

import { useRouter } from "next/navigation";
import { BellIcon, BellOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/use-notifications";

function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "たった今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

const TYPE_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  failure: "bg-red-500",
  timeout: "bg-amber-500",
};

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, isMarkingAll } =
    useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`通知${unreadCount > 0 ? ` (${unreadCount}件の未読)` : ""}`}
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">通知</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead()}
              disabled={isMarkingAll}
              className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
            >
              すべて既読
            </button>
          )}
        </div>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <BellOffIcon className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">通知はありません</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                onSelect={() => {
                  if (!n.read) markRead([n.id]);
                  router.push(`/scheduler/${n.task_id}`);
                }}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${TYPE_DOT[n.type] ?? TYPE_DOT.success}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {n.task_name ?? n.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                  {n.summary && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 break-words">
                      {n.summary}
                    </p>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
