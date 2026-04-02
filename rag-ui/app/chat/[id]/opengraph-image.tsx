import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "AI チャット — FleGrowth Stella";
export const size = ogSize;
export const contentType = ogContentType;

// Privacy: use same image as the chat list page
export default function Image() {
  return createOgImage(ogPages.chat);
}
