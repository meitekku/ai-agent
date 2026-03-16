import { create } from "zustand";

interface ProposalPanelState {
  isOpen: boolean;
  data: Record<string, unknown> | null;
  analysis: Record<string, unknown> | null;
  open: (data: Record<string, unknown>, analysis: Record<string, unknown>) => void;
  close: () => void;
}

export const useProposalPanelStore = create<ProposalPanelState>((set) => ({
  isOpen: false,
  data: null,
  analysis: null,
  open: (data, analysis) => set({ isOpen: true, data, analysis }),
  close: () => set({ isOpen: false, data: null, analysis: null }),
}));
