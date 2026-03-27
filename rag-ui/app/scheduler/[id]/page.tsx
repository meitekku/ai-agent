import type { Metadata } from "next";
import { SchedulerDetailPage } from "@/components/scheduler-detail-page";

export const metadata: Metadata = {
  title: "タスク詳細",
  description: "定時タスクの詳細表示・編集・実行履歴の確認。",
};

export default function SchedulerDetailRoute() {
  return <SchedulerDetailPage />;
}
