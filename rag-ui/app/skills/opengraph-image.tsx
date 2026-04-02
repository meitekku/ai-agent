import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "スキル管理 — FleGrowth Stella";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.skills);
}
