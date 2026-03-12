import type {
  SlideHistoryItem,
  SlideDeckDetail,
  SlideTemplate,
} from "./slide-types";

// ============================================================
// Slide History API
// ============================================================

export async function fetchSlideHistory(
  limit = 50,
  offset = 0,
): Promise<SlideHistoryItem[]> {
  const res = await fetch(
    `/api/history/slides?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function fetchSlideDeckDetail(
  id: number,
): Promise<SlideDeckDetail> {
  const res = await fetch(`/api/history/slides/${id}`);
  if (!res.ok) throw new Error("Failed to fetch slide deck detail");
  return res.json();
}

export async function saveSlideDeck(data: {
  title: string;
  question?: string;
  answer?: string;
  plan_md?: string;
  style_options?: Record<string, string | undefined>;
  slides: {
    slide_index: number;
    title?: string;
    slide_type?: string;
    html: string;
    plan_text?: string;
  }[];
}): Promise<{ id: number }> {
  const res = await fetch("/api/history/slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save slide deck");
  return res.json();
}

export async function updateSlideDeck(
  id: number,
  data: {
    slides: {
      slide_index: number;
      title?: string;
      slide_type?: string;
      html: string;
      plan_text?: string;
    }[];
    style_options?: Record<string, string | undefined>;
  },
): Promise<void> {
  const res = await fetch(`/api/history/slides/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update slide deck");
}

export async function renameSlideDeck(
  id: number,
  title: string,
): Promise<void> {
  const res = await fetch(`/api/history/slides/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to rename slide deck");
}

export async function deleteSlideDeck(id: number): Promise<void> {
  const res = await fetch(`/api/history/slides/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete slide deck");
}

export async function duplicateSlideDeck(id: number): Promise<{ id: number }> {
  const res = await fetch(`/api/history/slides/${id}/duplicate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to duplicate slide deck");
  return res.json();
}

// ============================================================
// Slide Template API
// ============================================================

export async function fetchSlideTemplates(): Promise<SlideTemplate[]> {
  const res = await fetch("/api/templates/slides");
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function saveSlideTemplate(data: {
  name: string;
  position: string;
  html: string;
  header_color?: string;
  footer_color?: string;
}): Promise<{ id: number }> {
  const res = await fetch("/api/templates/slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save slide template");
  return res.json();
}

export async function deleteSlideTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/templates/slides/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete slide template");
}
