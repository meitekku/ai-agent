import type { Metadata } from "next";
import { getKB } from "@/lib/rag-client";
import { KBDetailPage } from "@/components/kb-detail-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const kb = await getKB(slug);
    const name = kb.name || kb.title || slug;
    return {
      title: `${name} — ナレッジベース`,
      description: `ナレッジベース「${name}」のドキュメント管理・設定編集。`,
    };
  } catch {
    return {
      title: `${slug} — ナレッジベース`,
    };
  }
}

export default async function KBDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <KBDetailPage slug={slug} />;
}
