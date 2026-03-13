import { create } from "zustand";
import type { UIMessage } from "ai";
import type { MessageRow } from "./chat-db";

// ============================================================
// Types
// ============================================================

export interface TreeNode {
  id: string;
  parentId: string | null;
  role: string;
  parts: unknown[];
  childIds: string[];
  createdAt?: string;
  stopped?: boolean;
}

interface ChatTreeState {
  // Tree data
  nodes: Record<string, TreeNode>;
  rootIds: string[]; // Messages with parent_id = null
  activeLeafId: string | null;

  // Conversation metadata
  conversationId: string | null;

  // Actions
  loadTree: (conversationId: string, dbMessages: MessageRow[]) => void;
  addMessages: (
    msgs: {
      id: string;
      parentId: string | null;
      role: string;
      parts: unknown[];
      stopped?: boolean;
    }[],
  ) => void;
  getActivePath: () => UIMessage[];
  getSiblings: (nodeId: string) => string[];
  getSiblingIndex: (nodeId: string) => { index: number; total: number };
  switchBranch: (nodeId: string) => UIMessage[];
  setActiveLeafId: (leafId: string) => void;
  clear: () => void;
}

// ============================================================
// Helpers
// ============================================================

/** Walk from a node to the root, collecting IDs bottom-up, then reverse. */
function pathToRoot(nodes: Record<string, TreeNode>, leafId: string): string[] {
  const path: string[] = [];
  let current: string | null = leafId;
  const visited = new Set<string>();
  while (current && nodes[current] && !visited.has(current)) {
    visited.add(current);
    path.push(current);
    current = nodes[current].parentId;
  }
  path.reverse();
  return path;
}

/** From a node, find a leaf by always picking the last child. */
function findLeaf(nodes: Record<string, TreeNode>, nodeId: string): string {
  let current = nodeId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    const node = nodes[current];
    if (!node || node.childIds.length === 0) break;
    current = node.childIds[node.childIds.length - 1];
  }
  return current;
}

function nodesToUIMessages(
  nodes: Record<string, TreeNode>,
  path: string[],
): UIMessage[] {
  return path.map((id) => {
    const node = nodes[id];
    return {
      id: node.id,
      role: node.role as "user" | "assistant",
      parts: node.parts as UIMessage["parts"],
    };
  });
}

// ============================================================
// Store
// ============================================================

export const useChatTreeStore = create<ChatTreeState>((set, get) => ({
  nodes: {},
  rootIds: [],
  activeLeafId: null,
  conversationId: null,

  loadTree: (conversationId, dbMessages) => {
    const nodes: Record<string, TreeNode> = {};
    const rootIds: string[] = [];

    // First pass: create nodes
    for (const msg of dbMessages) {
      nodes[msg.id] = {
        id: msg.id,
        parentId: msg.parent_id,
        role: msg.role,
        parts: msg.parts as unknown[],
        childIds: [],
        createdAt: msg.created_at,
        stopped: msg.stopped,
      };
    }

    // Second pass: wire children
    for (const msg of dbMessages) {
      if (msg.parent_id && nodes[msg.parent_id]) {
        nodes[msg.parent_id].childIds.push(msg.id);
      } else if (!msg.parent_id) {
        rootIds.push(msg.id);
      }
    }

    // Determine active leaf: use stored or find last message's leaf
    let activeLeafId: string | null = null;
    if (dbMessages.length > 0) {
      // Default: walk from last root to leaf
      const lastRoot = rootIds[rootIds.length - 1];
      if (lastRoot) {
        activeLeafId = findLeaf(nodes, lastRoot);
      }
    }

    set({ nodes, rootIds, activeLeafId, conversationId });
  },

  addMessages: (msgs) => {
    const { nodes, rootIds } = get();
    const newNodes = { ...nodes };
    const newRootIds = [...rootIds];

    for (const msg of msgs) {
      if (newNodes[msg.id]) {
        // Update existing node (e.g. streaming update)
        newNodes[msg.id] = { ...newNodes[msg.id], parts: msg.parts };
        continue;
      }

      newNodes[msg.id] = {
        id: msg.id,
        parentId: msg.parentId,
        role: msg.role,
        parts: msg.parts,
        childIds: [],
        stopped: msg.stopped,
      };

      if (msg.parentId && newNodes[msg.parentId]) {
        newNodes[msg.parentId] = {
          ...newNodes[msg.parentId],
          childIds: [...newNodes[msg.parentId].childIds, msg.id],
        };
      } else if (!msg.parentId) {
        newRootIds.push(msg.id);
      }
    }

    // Set active leaf to the last added message's leaf
    const lastMsg = msgs[msgs.length - 1];
    const activeLeafId = lastMsg
      ? findLeaf(newNodes, lastMsg.id)
      : get().activeLeafId;

    set({ nodes: newNodes, rootIds: newRootIds, activeLeafId });
  },

  getActivePath: () => {
    const { nodes, activeLeafId } = get();
    if (!activeLeafId) return [];
    const path = pathToRoot(nodes, activeLeafId);
    return nodesToUIMessages(nodes, path);
  },

  getSiblings: (nodeId) => {
    const { nodes, rootIds } = get();
    const node = nodes[nodeId];
    if (!node) return [nodeId];
    if (!node.parentId)
      return rootIds.filter((id) => nodes[id]?.role === node.role);
    const parent = nodes[node.parentId];
    if (!parent) return [nodeId];
    return parent.childIds.filter((id) => nodes[id]?.role === node.role);
  },

  getSiblingIndex: (nodeId) => {
    const siblings = get().getSiblings(nodeId);
    const index = siblings.indexOf(nodeId);
    return { index: Math.max(0, index), total: siblings.length };
  },

  switchBranch: (nodeId) => {
    const { nodes } = get();
    const leaf = findLeaf(nodes, nodeId);
    set({ activeLeafId: leaf });
    return get().getActivePath();
  },

  setActiveLeafId: (leafId) => {
    set({ activeLeafId: leafId });
  },

  clear: () => {
    set({
      nodes: {},
      rootIds: [],
      activeLeafId: null,
      conversationId: null,
    });
  },
}));
