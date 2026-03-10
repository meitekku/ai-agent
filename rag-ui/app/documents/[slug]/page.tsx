import { KBDetailPage } from "@/components/kb-detail-page";

export default async function KBDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <KBDetailPage slug={slug} />;
}
