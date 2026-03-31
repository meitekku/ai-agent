"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskNotification } from "@/lib/scheduler-db";

export function useNotifications() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<TaskNotification[]> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) return [];
      const json: { notifications: TaskNotification[] } = await res.json();
      return json.notifications;
    },
    refetchInterval: 30_000,
  });

  const notifications = data ?? [];
  const unreadCount = notifications.length;

  const markRead = useMutation({
    mutationFn: async (ids: number[]) => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    notifications,
    unreadCount,
    isPending,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
    isMarkingAll: markAllRead.isPending,
  };
}
