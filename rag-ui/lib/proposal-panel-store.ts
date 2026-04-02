import { create } from "zustand";
import type { StyleOptions } from "@/components/style-options-panel";

type Phase = "analysis" | "templateCheck" | "styleSetup";

/** Fire-and-forget persist phase + styleOptions to DB */
function persistUI(sessionKey: string | null, phase: string, styleOptions: StyleOptions) {
  if (!sessionKey) return;
  fetch(`/api/crm/proposal-session/${sessionKey}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase, styleOptions }),
  }).catch(() => {});
}

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
  /** Restore phase + styleOptions from server (no DB write-back) */
  restoreUI: (phase: Phase, styleOptions: StyleOptions) => void;
}

export const useProposalPanelStore = create<ProposalPanelState>((set, get) => ({
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
  setPhase: (phase) => {
    const { sessionKey, styleOptions } = get();
    set({ phase });
    persistUI(sessionKey, phase, styleOptions);
  },
  setStyleOptions: (opts) => {
    const { sessionKey, phase } = get();
    set({ styleOptions: opts });
    persistUI(sessionKey, phase, opts);
  },
  restoreUI: (phase, styleOptions) => set({ phase, styleOptions }),
}));
