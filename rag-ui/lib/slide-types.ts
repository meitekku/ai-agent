// ============================================================
// Shared Slide Types (used by all slide viewers + API)
// ============================================================

// --- SlideStudio types ---

export type SlideCitation = {
  source_id?: number | null;
  source_title?: string;
  quote?: string;
};

export type SlideTable = {
  headers?: string[];
  rows?: string[][];
};

export type SlideChart = {
  type?: "bar" | "line" | "pie";
  title?: string;
  labels?: string[];
  datasets?: Array<{
    label?: string;
    data?: number[];
  }>;
};

export type Slide = {
  id?: string;
  title: string;
  layout?: "title" | "content" | "visual" | "table" | "chart" | "comparison" | null;
  bullets: string[];
  diagram_mermaid?: string;
  table?: SlideTable | null;
  image_url?: string;
  image_data_url?: string;
  image_prompt?: string;
  chart?: SlideChart | null;
  speaker_notes?: string;
  citations?: SlideCitation[];
};

export type SlideDeck = {
  title: string;
  summary?: string;
  slides: Slide[];
};

// --- VisualSlideViewer types ---

export type OutlineSlide = {
  slide_number: number;
  title: string;
  type: "cover" | "content" | "back-cover";
  key_message: string;
  visual_description: string;
  layout: string;
  text_elements: string[];
};

export type Outline = {
  title: string;
  slides: OutlineSlide[];
};

// --- HtmlSlideViewer types ---

export type SlideSection = {
  title: string;
  type: "cover" | "content" | "back-cover";
  plan_text: string;
};

export type GeneratedSlide = {
  index: number;
  title: string;
  html: string;
  type: string;
  fallback?: boolean;
};

export type StyleOptions = {
  industry?: string;
  profession?: string;
  ageGroup?: string;
  colorStyle?: string;
  font?: string;
};

// --- DB types ---

export type SlideHistoryItem = {
  id: number;
  title: string;
  question?: string;
  slide_count: number;
  style_options?: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type SlideDeckDetail = {
  id: number;
  title: string;
  question?: string;
  answer?: string;
  plan_md?: string;
  style_options?: Record<string, string>;
  slides: {
    slide_index: number;
    title: string;
    slide_type: string;
    html: string;
    plan_text?: string;
  }[];
  created_at: string;
  updated_at: string;
};

export type SlideTemplate = {
  id: number;
  name: string;
  position: string;
  html: string;
  header_color?: string;
  footer_color?: string;
  created_at: string;
};
