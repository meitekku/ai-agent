import type { Metadata } from "next";
import { SchedulerPage } from "@/components/scheduler-page";

export const metadata: Metadata = {
  title: "スケジューラ",
  description: "定時タスクの作成・管理と実行履歴の確認。",
};

export default function SchedulerRoute() {
  return <SchedulerPage />;
}
