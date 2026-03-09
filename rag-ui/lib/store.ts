import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageMeta {
  service: string;
}

export type SidebarSection = "history" | "documents" | "skills";

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
  sidebarPinned: boolean;
  sidebarSection: SidebarSection;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarPinned: (pinned: boolean) => void;
  toggleSidebarPinned: () => void;
  setSidebarSection: (section: SidebarSection) => void;
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

  // Sidebar — initialize as false to avoid SSR hydration mismatch
  sidebarOpen: false,
  sidebarPinned: false,
  sidebarSection: "documents",
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarPinned: (pinned) => {
    set({ sidebarPinned: pinned });
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-pinned", JSON.stringify(pinned));
    }
  },
  toggleSidebarPinned: () => {
    const next = !get().sidebarPinned;
    set({ sidebarPinned: next });
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-pinned", JSON.stringify(next));
    }
  },
  setSidebarSection: (section) => set({ sidebarSection: section }),
}));
