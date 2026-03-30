"use client";

import { memo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2Icon } from "lucide-react";
import { useSchedulerDetailStore } from "@/lib/scheduler-detail-store";

export const DeleteDialog = memo(function DeleteDialog({
  taskName,
  onDelete,
  deleting,
}: {
  taskName: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const showDelete = useSchedulerDetailStore((s) => s.showDelete);
  const setShowDelete = useSchedulerDetailStore((s) => s.setShowDelete);

  return (
    <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>タスクを削除</AlertDialogTitle>
          <AlertDialogDescription>
            「{taskName}」を削除しますか？実行履歴も全て削除されます。この操作は元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
            削除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
