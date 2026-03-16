import { create } from "zustand";
import type { StyleOptions } from "@/components/style-options-panel";

interface SlidePanelState {
  open: boolean;
  question: string;
  answer: string;
  instructions: string | null;
  styleOptions: StyleOptions | null;
  deckId: number | null;
  sourceMessageId: string | null;
  openPanel: (question: string, answer: string, instructions?: string | null, styleOptions?: StyleOptions | null, sourceMessageId?: string | null) => void;
  openDeck: (deckId: number) => void;
  closePanel: () => void;
  reopenPanel: () => void;
  resetPanel: () => void;
}

export const useSlidePanelStore = create<SlidePanelState>((set, get) => ({
  open: false,
  question: "",
  answer: "",
  instructions: null,
  styleOptions: null,
  deckId: null,
  sourceMessageId: null,

  openPanel: (question, answer, instructions, styleOptions, sourceMessageId) => {
    // Prevent duplicate trigger while panel is already open and working
    if (get().open) return;
    set({ open: true, question, answer, instructions: instructions ?? null, styleOptions: styleOptions ?? null, deckId: null, sourceMessageId: sourceMessageId ?? null });
  },

  openDeck: (deckId) => {
    if (get().open) return;
    set({ open: true, question: "", answer: "", instructions: null, styleOptions: null, deckId, sourceMessageId: null });
  },

  // Hide panel but keep data for re-open
  closePanel: () => set({ open: false }),

  // Re-open with existing data
  reopenPanel: () => {
    const state = get();
    if (state.open) return;
    set({ open: true });
  },

  // Full reset (for new generation requests)
  resetPanel: () =>
    set({ open: false, question: "", answer: "", instructions: null, styleOptions: null, deckId: null, sourceMessageId: null }),
}));
