import { GraphPage } from "@/components/graph-page";

export default async function GraphRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GraphPage slug={slug} />;
}
