import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "ドキュメント管理 — FleGrowth Stella";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.documents);
}
