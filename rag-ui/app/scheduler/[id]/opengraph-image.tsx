import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "スケジューラ — FleGrowth Sales Assist";
export const size = ogSize;
export const contentType = ogContentType;

// Privacy: use same image as the scheduler list page
export default function Image() {
  return createOgImage(ogPages.scheduler);
}
