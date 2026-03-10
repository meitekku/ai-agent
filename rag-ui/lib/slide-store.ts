import { create } from "zustand";
import type { SlideSection } from "./slide-prompts";

export type SlidePhase =
  | "idle"
  | "planning"
  | "plan_ready"
  | "rendering"
  | "done"
  | "error";

interface SlideState {
  // Modal
  open: boolean;
  question: string;
  answer: string;

  // Pipeline
  phase: SlidePhase;
  planMd: string;
  deckTitle: string;
  slides: SlideSection[];
  renderedHtml: Record<number, string>;
  renderingIndex: number;
  currentSlide: number;
  error: string | null;
  exporting: boolean;

  // Actions
  openSlideViewer: (question: string, answer: string) => void;
  close: () => void;
  setPlan: (planMd: string, deckTitle: string, slides: SlideSection[]) => void;
  setRenderedSlide: (index: number, html: string) => void;
  setCurrentSlide: (index: number) => void;
  setPhase: (phase: SlidePhase) => void;
  setRenderingIndex: (index: number) => void;
  setError: (error: string) => void;
  setExporting: (exporting: boolean) => void;
  reset: () => void;
}

const initialState = {
  open: false,
  question: "",
  answer: "",
  phase: "idle" as SlidePhase,
  planMd: "",
  deckTitle: "",
  slides: [] as SlideSection[],
  renderedHtml: {} as Record<number, string>,
  renderingIndex: -1,
  currentSlide: 0,
  error: null as string | null,
  exporting: false,
};

export const useSlideStore = create<SlideState>((set) => ({
  ...initialState,

  openSlideViewer: (question, answer) =>
    set({
      ...initialState,
      open: true,
      question,
      answer,
      phase: "planning",
    }),

  close: () => set({ open: false }),

  setPlan: (planMd, deckTitle, slides) =>
    set({ planMd, deckTitle, slides, phase: "plan_ready" }),

  setRenderedSlide: (index, html) =>
    set((state) => ({
      renderedHtml: { ...state.renderedHtml, [index]: html },
    })),

  setCurrentSlide: (index) => set({ currentSlide: index }),

  setPhase: (phase) => set({ phase }),

  setRenderingIndex: (index) => set({ renderingIndex: index }),

  setError: (error) => set({ error, phase: "error" }),

  setExporting: (exporting) => set({ exporting }),

  reset: () => set(initialState),
}));
