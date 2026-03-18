import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageMeta {
  service: string;
}

// ---------------------------------------------------------------------------
// Model definitions
// ---------------------------------------------------------------------------

export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export const GEMINI_MODELS: ModelOption[] = [
  { id: "gemini-2.5-flash", label: "2.5 Flash", description: "高速バランス型" },
  { id: "gemini-2.5-flash-image", label: "2.5 Flash 画像", description: "画像生成・編集" },
  { id: "gemini-2.5-pro", label: "2.5 Pro", description: "高精度推論" },
  { id: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite", description: "最安・高速" },
  { id: "gemini-3-flash-preview", label: "3 Flash", description: "最新世代（Preview）" },
  { id: "gemini-3.1-pro-preview", label: "3.1 Pro", description: "最上位" },
];

export function isImageModel(modelId: string | null): boolean {
  return !!modelId && modelId.includes("-image");
}

// ---------------------------------------------------------------------------
// Chat Settings Store
// ---------------------------------------------------------------------------

const DEFAULT_SERVICE = "lightrag";

interface ChatSettingsState {
  // Service
  service: string;
  setService: (service: string) => void;

  // Model selection (null = use server default from GEMINI_MODEL env)
  chatModel: string | null;
  setChatModel: (model: string | null) => void;

  // Active KB
  activeKb: string | null;
  setActiveKb: (kb: string | null) => void;

  // Per-message metadata (service used for each assistant message)
  messageMeta: Record<string, MessageMeta>;
  recordMessageMeta: (messageId: string) => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Image generating state (for navigation guard)
  imageGenerating: boolean;
  setImageGenerating: (v: boolean) => void;

  // Thinking mode toggle
  thinking: boolean;
  setThinking: (v: boolean) => void;

  // Chat title (shown in header)
  chatTitle: string;
  setChatTitle: (title: string) => void;

  // Chat reset counter (used as key to force ChatPage remount on /new)
  chatResetCounter: number;
  incrementChatReset: () => void;
}

export const useChatSettingsStore = create<ChatSettingsState>((set, get) => ({
  // Service
  service: DEFAULT_SERVICE,
  setService: (service) => set({ service }),

  // Model selection
  chatModel: null,
  setChatModel: (model) => set({ chatModel: model }),

  // Active KB
  activeKb: null,
  setActiveKb: (kb) => set({ activeKb: kb }),

  // Per-message metadata
  messageMeta: {},
  recordMessageMeta: (messageId) => {
    const { messageMeta, service } = get();
    if (messageMeta[messageId]) return;
    set({
      messageMeta: {
        ...messageMeta,
        [messageId]: { service },
      },
    });
  },

  // Sidebar
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // Image generating
  imageGenerating: false,
  setImageGenerating: (v) => set({ imageGenerating: v }),

  // Thinking mode
  thinking: false,
  setThinking: (v) => set({ thinking: v }),

  // Chat title
  chatTitle: "",
  setChatTitle: (title) => set({ chatTitle: title }),

  // Chat reset
  chatResetCounter: 0,
  incrementChatReset: () =>
    set((s) => ({ chatResetCounter: s.chatResetCounter + 1 })),
}));
