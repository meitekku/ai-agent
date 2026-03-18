import { create } from "zustand";

interface SlideElement {
  type: "text" | "shape" | "list" | "kpi" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  items?: string[];
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  fill?: string;
  borderColor?: string;
  label?: string;
  value?: string;
  valueColor?: string;
  rows?: string[][];
  headerBg?: string;
}

interface SlideDefinition {
  title: string;
  subtitle?: string;
  layout: string;
  bgColor: string;
  headerColor: string;
  elements: SlideElement[];
}

export interface PresentationPlan {
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    lightText: string;
  };
  slides: SlideDefinition[];
}

type Phase = "analysis" | "templateCheck" | "generating" | "preview";

interface ProposalPanelState {
  isOpen: boolean;
  sessionKey: string | null;
  phase: Phase;
  // Session data (fetched from API)
  data: Record<string, unknown> | null;
  analysis: Record<string, unknown> | null;
  // Preview
  plan: PresentationPlan | null;
  activeSlideIndex: number;

  open: (sessionKey: string) => void;
  close: () => void;
  setSessionData: (
    data: Record<string, unknown>,
    analysis: Record<string, unknown>,
  ) => void;
  setPhase: (phase: Phase) => void;
  setPlan: (plan: PresentationPlan) => void;
  setActiveSlideIndex: (index: number) => void;
  updateSlide: (index: number, slide: SlideDefinition) => void;
}

export const useProposalPanelStore = create<ProposalPanelState>((set, get) => ({
  isOpen: false,
  sessionKey: null,
  phase: "analysis",
  data: null,
  analysis: null,
  plan: null,
  activeSlideIndex: 0,

  open: (sessionKey) =>
    set({
      isOpen: true,
      sessionKey,
      phase: "analysis",
      plan: null,
      activeSlideIndex: 0,
    }),
  close: () =>
    set({
      isOpen: false,
      sessionKey: null,
      phase: "analysis",
      data: null,
      analysis: null,
      plan: null,
      activeSlideIndex: 0,
    }),
  setSessionData: (data, analysis) => set({ data, analysis }),
  setPhase: (phase) => set({ phase }),
  setPlan: (plan) => set({ plan, phase: "preview", activeSlideIndex: 0 }),
  setActiveSlideIndex: (index) => set({ activeSlideIndex: index }),
  updateSlide: (index, slide) => {
    const plan = get().plan;
    if (!plan) return;
    const newSlides = [...plan.slides];
    newSlides[index] = slide;
    set({ plan: { ...plan, slides: newSlides } });
  },
}));
