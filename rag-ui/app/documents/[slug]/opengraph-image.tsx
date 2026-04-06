import { createOgImage, ogSize, ogContentType, ogPages } from "@/lib/og-image";

export const alt = "ドキュメント管理 — FleGrowth Sales Assist";
export const size = ogSize;
export const contentType = ogContentType;

// Privacy: use same image as the documents list page
export default function Image() {
  return createOgImage(ogPages.documents);
}
