import type { Metadata } from "next";
import { getTask } from "@/lib/scheduler-db";
import { SchedulerDetailPage } from "@/components/scheduler-detail-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const task = await getTask(parseInt(id, 10));
    if (task) {
      return {
        title: `${task.name} — スケジューラ`,
        description: `定時タスク「${task.name}」の詳細設定・実行履歴の確認。`,
      };
    }
  } catch {
    // fall through
  }
  return {
    title: "タスク詳細 — スケジューラ",
    description: "定時タスクの詳細設定・実行履歴の確認。",
  };
}

export default function SchedulerDetailRoute() {
  return <SchedulerDetailPage />;
}
