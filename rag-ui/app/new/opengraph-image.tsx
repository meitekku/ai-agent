import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "AI チャット — FleGrowth Sales Assist";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.chat);
}
