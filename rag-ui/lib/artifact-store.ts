import { create } from "zustand";

export interface ArtifactVersionMeta {
  version: number;
  command: string;
  description: string;
}

export interface ArtifactListItem {
  id: string;
  title: string;
  kind: string;
  currentVersion: number;
}

interface ArtifactState {
  id: string | null;
  title: string;
  kind: "html" | "code" | "text" | "markdown";
  language: string;
  content: string;
  version: number;
  isOpen: boolean;
  isStreaming: boolean;
  versions: ArtifactVersionMeta[];
  /** All artifacts in the current conversation */
  artifactList: ArtifactListItem[];

  openArtifact: (data: {
    id: string;
    title: string;
    kind: string;
    content: string;
    version: number;
    language?: string;
    versions?: ArtifactVersionMeta[];
  }) => void;
  updateArtifact: (data: {
    content: string;
    version: number;
    title?: string;
    kind?: string;
    language?: string;
    command?: string;
  }) => void;
  /** Show partial content while tool input is streaming */
  setStreaming: (data: {
    title?: string;
    kind?: string;
    language?: string;
    content: string;
  }) => void;
  /** Transition from streaming to finalized */
  finalizeStreaming: () => void;
  closeArtifact: () => void;
  setVersion: (version: number, content: string) => void;
  setArtifactList: (list: ArtifactListItem[]) => void;
  /** Add or update an item in the artifact list */
  upsertArtifactListItem: (item: ArtifactListItem) => void;
  reset: () => void;
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  id: null,
  title: "",
  kind: "html",
  language: "",
  content: "",
  version: 0,
  isOpen: false,
  isStreaming: false,
  versions: [],
  artifactList: [],

  openArtifact: ({ id, title, kind, content, version, language, versions }) =>
    set({
      id,
      title,
      kind: kind as ArtifactState["kind"],
      language: language ?? "",
      content,
      version,
      isOpen: true,
      isStreaming: false,
      versions: versions ?? [{ version, command: "create", description: "" }],
    }),

  updateArtifact: ({ content, version, title, kind, language, command }) =>
    set((s) => ({
      content,
      version,
      ...(title ? { title } : {}),
      ...(kind ? { kind: kind as ArtifactState["kind"] } : {}),
      ...(language !== undefined ? { language } : {}),
      isOpen: true,
      isStreaming: false,
      versions: [
        ...s.versions,
        { version, command: command ?? "update", description: "" },
      ],
    })),

  setStreaming: ({ title, kind, language, content }) =>
    set(() => ({
      ...(title ? { title } : {}),
      ...(kind ? { kind: kind as ArtifactState["kind"] } : {}),
      ...(language !== undefined ? { language } : {}),
      content,
      isOpen: true,
      isStreaming: true,
    })),

  finalizeStreaming: () => set({ isStreaming: false }),

  closeArtifact: () => set({ isOpen: false }),

  setVersion: (version, content) => set({ version, content }),

  setArtifactList: (list) => set({ artifactList: list }),

  upsertArtifactListItem: (item) =>
    set((s) => {
      const idx = s.artifactList.findIndex((a) => a.id === item.id);
      if (idx >= 0) {
        const updated = [...s.artifactList];
        updated[idx] = item;
        return { artifactList: updated };
      }
      return { artifactList: [...s.artifactList, item] };
    }),

  reset: () =>
    set({
      id: null,
      title: "",
      kind: "html",
      language: "",
      content: "",
      version: 0,
      isOpen: false,
      isStreaming: false,
      versions: [],
      artifactList: [],
    }),
}));
