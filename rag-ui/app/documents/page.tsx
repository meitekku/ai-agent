import type { Metadata } from "next";
import { DocumentsPage } from "@/components/documents-page";

export const metadata: Metadata = {
  title: "ドキュメント管理",
  description:
    "ナレッジベースの作成・管理と、PDF / CSV ドキュメントのアップロード・入庫状況の確認。",
};

export default function DocumentsRoute() {
  return <DocumentsPage />;
}
