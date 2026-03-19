// ============================================================
// Types
// ============================================================

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
  failed?: boolean;
};

export type Phase =
  | "planning"
  | "plan_ready"
  | "generating"
  | "done"
  | "error"
  | "loading";
