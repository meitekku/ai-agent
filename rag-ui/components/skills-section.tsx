"use client";

import { memo, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Skill {
  id: number;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("Failed to fetch skills");
  const data = await res.json();
  return data.skills || [];
}

// ---------------------------------------------------------------------------
// SkillsSection
// ---------------------------------------------------------------------------

export const SkillsSection = memo(function SkillsSection() {
  const queryClient = useQueryClient();
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");

  const { data: skills = [], isPending: loading } = useQuery({
    queryKey: ["skills"],
    queryFn: fetchSkills,
  });

  const enabledCount = skills.filter((s) => s.enabled).length;

  // -- Create ---------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; content: string }) => {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Create failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      closeForm();
    },
  });

  // -- Update ---------------------------------------------------------------

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string; content?: string; enabled?: boolean }) => {
      const res = await fetch(`/api/skills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      closeForm();
    },
  });

  // -- Delete ---------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  // -- Toggle enabled -------------------------------------------------------

  const handleToggle = useCallback(
    (skill: Skill) => {
      // Optimistic update
      queryClient.setQueryData<Skill[]>(["skills"], (old) =>
        old?.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s)),
      );
      updateMutation.mutate(
        { id: skill.id, enabled: !skill.enabled },
        {
          onError: () => {
            queryClient.invalidateQueries({ queryKey: ["skills"] });
          },
        },
      );
    },
    [queryClient, updateMutation],
  );

  // -- Form helpers ---------------------------------------------------------

  const openCreate = useCallback(() => {
    setFormName("");
    setFormDescription("");
    setFormContent("");
    setEditingSkill(null);
    setIsCreating(true);
  }, []);

  const openEdit = useCallback((skill: Skill) => {
    setFormName(skill.name);
    setFormDescription(skill.description);
    setFormContent(skill.content);
    setEditingSkill(skill);
    setIsCreating(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsCreating(false);
    setEditingSkill(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!formName.trim() || !formContent.trim()) return;
    if (editingSkill) {
      updateMutation.mutate({
        id: editingSkill.id,
        name: formName.trim(),
        description: formDescription.trim(),
        content: formContent.trim(),
      });
    } else {
      createMutation.mutate({
        name: formName.trim(),
        description: formDescription.trim(),
        content: formContent.trim(),
      });
    }
  }, [formName, formDescription, formContent, editingSkill, createMutation, updateMutation]);

  const confirmDelete = useCallback(
    (skill: Skill) => {
      setDeleteTarget(null);
      deleteMutation.mutate(skill.id);
    },
    [deleteMutation],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // -- Render ---------------------------------------------------------------

  return (
    <>
      {/* Create button + counter */}
      <div className="flex items-center justify-between p-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openCreate}>
          <PlusIcon className="size-3.5" />
          新規スキル
        </Button>
        {skills.length > 0 && (
          <Badge variant="secondary" className="text-xs font-normal">
            {enabledCount} / {skills.length} 有効
          </Badge>
        )}
      </div>

      {/* Skill list */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <SparklesIcon className="size-8 opacity-40" />
            <p>スキルがありません</p>
            <p className="text-xs">ドメイン知識やワークフロー指示を追加しましょう</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {skills.map((skill) => (
              <li
                key={skill.id}
                className="group rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`size-1.5 rounded-full shrink-0 ${skill.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  <span className="flex-1 truncate text-sm font-medium">{skill.name}</span>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => handleToggle(skill)}
                    className="scale-75"
                  />
                </div>
                {skill.description && (
                  <p className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground">
                    {skill.description}
                  </p>
                )}
                <div className="mt-1 flex gap-1 pl-3.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(skill)}
                  >
                    <PencilIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(skill)}
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={isCreating} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSkill ? "スキルを編集" : "新規スキル"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">名前</Label>
              <Input
                id="skill-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例: 専門用語ガイド"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-desc">説明（任意）</Label>
              <Input
                id="skill-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="例: 業界用語の正しい表記を指示"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-content">内容</Label>
              <Textarea
                id="skill-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="システムプロンプトに注入される指示内容..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeForm}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formName.trim() || !formContent.trim() || isSaving}
            >
              {isSaving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {editingSkill ? "更新" : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スキルを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name}」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && confirmDelete(deleteTarget)}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
