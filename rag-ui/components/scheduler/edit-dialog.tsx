"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2Icon } from "lucide-react";
import { ALL_TOOLS, configToCron, TaskFormFields } from "@/components/scheduler-shared";
import { useSchedulerDetailStore, type ScheduledTask } from "@/lib/scheduler-detail-store";

export const EditDialog = memo(function EditDialog({
  task,
  onSave,
  saving,
}: {
  task: ScheduledTask;
  onSave: (data: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const showEdit = useSchedulerDetailStore((s) => s.showEdit);
  const editForm = useSchedulerDetailStore((s) => s.editForm);
  const closeEdit = useSchedulerDetailStore((s) => s.closeEdit);
  const setEditForm = useSchedulerDetailStore((s) => s.setEditForm);

  return (
    <Dialog open={showEdit} onOpenChange={(open) => { if (!open) closeEdit(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>タスクを編集</DialogTitle>
          <DialogDescription>タスクの設定を変更します。</DialogDescription>
        </DialogHeader>
        {editForm && (
          <TaskFormFields values={editForm} onChange={setEditForm} autoFocus />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeEdit}>キャンセル</Button>
          <Button
            onClick={() => {
              if (!editForm) return;
              const isManualNew = editForm.schedule.frequency === "manual";
              onSave({
                name: editForm.name.trim(),
                description: editForm.description.trim(),
                cron_expr: configToCron(editForm.schedule),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                prompt: editForm.prompt.trim(),
                model: editForm.model === "default" ? null : editForm.model,
                allowed_tools: ALL_TOOLS,
                enabled: isManualNew ? false : task.enabled,
              });
            }}
            disabled={
              !editForm?.name.trim() ||
              !editForm?.description.trim() ||
              !editForm?.prompt.trim() ||
              saving
            }
          >
            {saving && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
