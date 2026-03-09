import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageMeta {
  service: string;
}

// ---------------------------------------------------------------------------
// Chat Settings Store
// ---------------------------------------------------------------------------

const DEFAULT_SERVICE = "lightrag";

interface ChatSettingsState {
  // Service
  service: string;
  setService: (service: string) => void;

  // Per-message metadata (service used for each assistant message)
  messageMeta: Record<string, MessageMeta>;
  recordMessageMeta: (messageId: string) => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Chat reset counter (used as key to force ChatPage remount on /new)
  chatResetCounter: number;
  incrementChatReset: () => void;
}

export const useChatSettingsStore = create<ChatSettingsState>((set, get) => ({
  // Service
  service: DEFAULT_SERVICE,
  setService: (service) => set({ service }),

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

  // Chat reset
  chatResetCounter: 0,
  incrementChatReset: () => set((s) => ({ chatResetCounter: s.chatResetCounter + 1 })),
}));
