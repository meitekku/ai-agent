import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "FleGrowth Sales Assist — 統合 AI アシスタント";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.root);
}
