import { create } from "zustand";

interface SlidePanelState {
  open: boolean;
  question: string;
  answer: string;
  deckId: number | null;
  openPanel: (question: string, answer: string) => void;
  openDeck: (deckId: number) => void;
  closePanel: () => void;
}

export const useSlidePanelStore = create<SlidePanelState>((set) => ({
  open: false,
  question: "",
  answer: "",
  deckId: null,

  openPanel: (question, answer) =>
    set({ open: true, question, answer, deckId: null }),

  openDeck: (deckId) =>
    set({ open: true, question: "", answer: "", deckId }),

  closePanel: () =>
    set({ open: false, question: "", answer: "", deckId: null }),
}));
