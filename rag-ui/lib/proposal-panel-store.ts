import { create } from "zustand";

interface ProposalPanelState {
  isOpen: boolean;
  data: Record<string, unknown> | null;
  analysis: Record<string, unknown> | null;
  additionalContext: string | null;
  open: (data: Record<string, unknown>, analysis: Record<string, unknown>, additionalContext?: string) => void;
  close: () => void;
}

export const useProposalPanelStore = create<ProposalPanelState>((set) => ({
  isOpen: false,
  data: null,
  analysis: null,
  additionalContext: null,
  open: (data, analysis, additionalContext) => set({ isOpen: true, data, analysis, additionalContext: additionalContext || null }),
  close: () => set({ isOpen: false, data: null, analysis: null, additionalContext: null }),
}));
