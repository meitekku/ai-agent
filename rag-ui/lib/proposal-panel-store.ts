import { create } from "zustand";
import type { StyleOptions } from "@/components/style-options-panel";

type Phase = "analysis" | "templateCheck" | "styleSetup";

interface ProposalPanelState {
  isOpen: boolean;
  sessionKey: string | null;
  phase: Phase;
  // Session data (fetched from API)
  data: Record<string, unknown> | null;
  analysis: Record<string, unknown> | null;
  // Style options for slide generation
  styleOptions: StyleOptions;

  open: (sessionKey: string) => void;
  close: () => void;
  setSessionData: (
    data: Record<string, unknown>,
    analysis: Record<string, unknown>,
  ) => void;
  setPhase: (phase: Phase) => void;
  setStyleOptions: (opts: StyleOptions) => void;
}

export const useProposalPanelStore = create<ProposalPanelState>((set) => ({
  isOpen: false,
  sessionKey: null,
  phase: "analysis",
  data: null,
  analysis: null,
  styleOptions: {},

  open: (sessionKey) =>
    set({
      isOpen: true,
      sessionKey,
      phase: "analysis",
      styleOptions: {},
    }),
  close: () =>
    set({
      isOpen: false,
      sessionKey: null,
      phase: "analysis",
      data: null,
      analysis: null,
      styleOptions: {},
    }),
  setSessionData: (data, analysis) => set({ data, analysis }),
  setPhase: (phase) => set({ phase }),
  setStyleOptions: (opts) => set({ styleOptions: opts }),
}));
