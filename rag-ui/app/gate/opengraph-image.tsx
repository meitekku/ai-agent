import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "ログイン — FleGrowth Stella";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return createOgImage(ogPages.gate);
}
