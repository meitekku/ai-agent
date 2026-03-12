import { create } from "zustand";

interface SlidePanelState {
  open: boolean;
  question: string;
  answer: string;
  instructions: string | null;
  deckId: number | null;
  openPanel: (question: string, answer: string, instructions?: string | null) => void;
  openDeck: (deckId: number) => void;
  closePanel: () => void;
}

export const useSlidePanelStore = create<SlidePanelState>((set, get) => ({
  open: false,
  question: "",
  answer: "",
  instructions: null,
  deckId: null,

  openPanel: (question, answer, instructions) => {
    // Prevent duplicate trigger while panel is already open and working
    if (get().open) return;
    set({ open: true, question, answer, instructions: instructions ?? null, deckId: null });
  },

  openDeck: (deckId) => {
    if (get().open) return;
    set({ open: true, question: "", answer: "", instructions: null, deckId });
  },

  closePanel: () =>
    set({ open: false, question: "", answer: "", instructions: null, deckId: null }),
}));
