import { create } from "zustand";
import type { StyleOptions } from "@/components/style-options-panel";

type SlideEntry = { index: number; title: string; html: string; type: string };

interface SavedSlideState {
  deckId: number | null;
  cachedSlides: SlideEntry[] | null;
  cachedDeckTitle: string | null;
  conversationDeckId: number | null;
}

interface SlidePanelState {
  open: boolean;
  question: string;
  answer: string;
  instructions: string | null;
  styleOptions: StyleOptions | null;
  deckId: number | null;
  sourceMessageId: string | null;
  // v2: cache + version tracking
  cachedSlides: SlideEntry[] | null;
  cachedDeckTitle: string | null;
  conversationDeckId: number | null;
  refreshToken: number;
  // v3: per-conversation state persistence
  savedStates: Record<string, SavedSlideState>;

  openPanel: (
    question: string,
    answer: string,
    instructions?: string | null,
    styleOptions?: StyleOptions | null,
    sourceMessageId?: string | null,
  ) => void;
  openDeck: (deckId: number) => void;
  closePanel: () => void;
  reopenPanel: () => void;
  resetPanel: () => void;
  // v2 actions
  setCachedSlides: (slides: SlideEntry[], title: string) => void;
  clearCache: () => void;
  triggerRefresh: () => void;
  setConversationDeckId: (deckId: number | null) => void;
  // v3 actions: per-conversation save/restore
  saveForConversation: (convId: string) => void;
  restoreForConversation: (convId: string) => void;
}

export const useSlidePanelStore = create<SlidePanelState>((set, get) => ({
  open: false,
  question: "",
  answer: "",
  instructions: null,
  styleOptions: null,
  deckId: null,
  sourceMessageId: null,
  cachedSlides: null,
  cachedDeckTitle: null,
  conversationDeckId: null,
  refreshToken: 0,
  savedStates: {},

  openPanel: (
    question,
    answer,
    instructions,
    styleOptions,
    sourceMessageId,
  ) => {
    // Prevent duplicate trigger while panel is already open and working
    if (get().open) return;
    set({
      open: true,
      question,
      answer,
      instructions: instructions ?? null,
      styleOptions: styleOptions ?? null,
      deckId: null,
      sourceMessageId: sourceMessageId ?? null,
    });
  },

  openDeck: (deckId) => {
    if (get().open) return;
    set({
      open: true,
      question: "",
      answer: "",
      instructions: null,
      styleOptions: null,
      deckId,
      sourceMessageId: null,
    });
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
    set({
      open: false,
      question: "",
      answer: "",
      instructions: null,
      styleOptions: null,
      deckId: null,
      sourceMessageId: null,
      cachedSlides: null,
      cachedDeckTitle: null,
    }),

  setCachedSlides: (slides, title) =>
    set({ cachedSlides: slides, cachedDeckTitle: title }),

  clearCache: () => set({ cachedSlides: null, cachedDeckTitle: null }),

  triggerRefresh: () => set((s) => ({ refreshToken: s.refreshToken + 1 })),

  setConversationDeckId: (deckId) => set({ conversationDeckId: deckId }),

  saveForConversation: (convId) => {
    const s = get();
    if (!s.cachedSlides && !s.conversationDeckId && !s.deckId) return;
    set({
      savedStates: {
        ...s.savedStates,
        [convId]: {
          deckId: s.deckId,
          cachedSlides: s.cachedSlides,
          cachedDeckTitle: s.cachedDeckTitle,
          conversationDeckId: s.conversationDeckId,
        },
      },
    });
  },

  restoreForConversation: (convId) => {
    const saved = get().savedStates[convId];
    if (!saved) {
      set({
        open: false,
        question: "",
        answer: "",
        instructions: null,
        styleOptions: null,
        deckId: null,
        sourceMessageId: null,
        cachedSlides: null,
        cachedDeckTitle: null,
        conversationDeckId: null,
      });
      return;
    }
    set({
      open: false,
      question: "",
      answer: "",
      instructions: null,
      styleOptions: null,
      deckId: saved.deckId,
      sourceMessageId: null,
      cachedSlides: saved.cachedSlides,
      cachedDeckTitle: saved.cachedDeckTitle,
      conversationDeckId: saved.conversationDeckId,
    });
  },
}));
