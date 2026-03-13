import { create } from "zustand";
import type { StyleOptions } from "@/components/style-options-panel";

interface SlidePanelState {
  open: boolean;
  question: string;
  answer: string;
  instructions: string | null;
  styleOptions: StyleOptions | null;
  deckId: number | null;
  openPanel: (question: string, answer: string, instructions?: string | null, styleOptions?: StyleOptions | null) => void;
  openDeck: (deckId: number) => void;
  closePanel: () => void;
}

export const useSlidePanelStore = create<SlidePanelState>((set, get) => ({
  open: false,
  question: "",
  answer: "",
  instructions: null,
  styleOptions: null,
  deckId: null,

  openPanel: (question, answer, instructions, styleOptions) => {
    // Prevent duplicate trigger while panel is already open and working
    if (get().open) return;
    set({ open: true, question, answer, instructions: instructions ?? null, styleOptions: styleOptions ?? null, deckId: null });
  },

  openDeck: (deckId) => {
    if (get().open) return;
    set({ open: true, question: "", answer: "", instructions: null, styleOptions: null, deckId });
  },

  closePanel: () =>
    set({ open: false, question: "", answer: "", instructions: null, styleOptions: null, deckId: null }),
}));
