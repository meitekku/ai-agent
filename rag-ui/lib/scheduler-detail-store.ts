import { create } from "zustand";
import type { TaskFormValues } from "@/components/scheduler-shared";

// ---------------------------------------------------------------------------
// Types (shared across scheduler detail components)
// ---------------------------------------------------------------------------

export interface ExecutionFileInfo {
  file_id: string;
  filename: string;
  media_type: string;
  size_bytes: number | null;
}

export interface TaskExecution {
  id: number;
  task_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  tool_calls: unknown[];
  result: string | null;
  error: string | null;
  retry_count: number;
  execution_ms: number | null;
  created_at: string;
  files?: ExecutionFileInfo[];
}

export interface ScheduledTask {
  id: number;
  name: string;
  description: string;
  cron_expr: string;
  prompt: string;
  kb_slug: string | null;
  allowed_tools: string[];
  max_tool_calls: number;
  timeout_sec: number;
  retry_max: number;
  model: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SchedulerDetailState {
  // Result dialog
  viewingExec: TaskExecution | null;
  resultOpen: boolean;
  openResult: (exec: TaskExecution) => void;
  closeResult: () => void;

  // Edit dialog
  showEdit: boolean;
  editForm: TaskFormValues | null;
  openEdit: (form: TaskFormValues) => void;
  closeEdit: () => void;
  setEditForm: (form: TaskFormValues) => void;

  // Delete dialog
  showDelete: boolean;
  setShowDelete: (v: boolean) => void;
}

export const useSchedulerDetailStore = create<SchedulerDetailState>((set) => ({
  // Result dialog
  viewingExec: null,
  resultOpen: false,
  openResult: (exec) => set({ viewingExec: exec, resultOpen: true }),
  closeResult: () => set({ resultOpen: false }),

  // Edit dialog
  showEdit: false,
  editForm: null,
  openEdit: (form) => set({ editForm: form, showEdit: true }),
  closeEdit: () => set({ showEdit: false }),
  setEditForm: (form) => set({ editForm: form }),

  // Delete dialog
  showDelete: false,
  setShowDelete: (v) => set({ showDelete: v }),
}));
