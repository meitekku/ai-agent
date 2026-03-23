import type { Metadata } from "next";
import { SkillsPage } from "@/components/skills-page";

export const metadata: Metadata = {
  title: "スキル管理",
  description:
    "AI アシスタントにドメイン知識を追加するスキルの作成・編集・有効化管理。",
};

export default function SkillsRoute() {
  return <SkillsPage />;
}
