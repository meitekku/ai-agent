import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "スケジューラ — FleGrowth Sales Assist";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.scheduler);
}
