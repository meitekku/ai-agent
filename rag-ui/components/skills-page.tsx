"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ArchiveIcon,
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
  source_type?: "manual" | "zip";
  created_at: string;
  updated_at: string;
}

async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("Failed to fetch skills");
  const data = await res.json();
  return data.skills || [];
}

// ---------------------------------------------------------------------------
// SkillsPage
// ---------------------------------------------------------------------------

export const SkillsPage = memo(function SkillsPage() {
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

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });

  const zipInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/skills/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });

  const handleZipUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadMutation.mutate(file);
      e.target.value = "";
    },
    [uploadMutation],
  );

  const handleToggle = useCallback(
    (skill: Skill) => {
      queryClient.setQueryData<Skill[]>(["skills"], (old) =>
        old?.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s)),
      );
      updateMutation.mutate(
        { id: skill.id, enabled: !skill.enabled },
        { onError: () => queryClient.invalidateQueries({ queryKey: ["skills"] }) },
      );
    },
    [queryClient, updateMutation],
  );

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

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">スキル</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              システムプロンプトに注入されるドメイン知識・ワークフロー指示
              {skills.length > 0 && (
                <span className="ml-2">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {enabledCount} / {skills.length} 有効
                  </Badge>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => zipInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArchiveIcon className="size-4" />
              )}
              ZIP アップロード
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleZipUpload}
            />
            <Button className="gap-2" onClick={openCreate}>
              <PlusIcon className="size-4" />
              新規スキル
            </Button>
          </div>
        </div>
      </div>

      {/* Skill list */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <SparklesIcon className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">スキルがありません</p>
                <p className="text-sm text-muted-foreground">
                  ドメイン知識やワークフロー指示を追加して、AI の回答をカスタマイズしましょう
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="group rounded-lg border border-border/50 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`size-2 rounded-full shrink-0 transition-colors ${
                        skill.enabled ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                    <span className="flex-1 text-sm font-medium">
                      {skill.name}
                      {skill.source_type === "zip" && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal">
                          ZIP
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(skill)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(skill)}
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={() => handleToggle(skill)}
                      />
                    </div>
                  </div>
                  {skill.description && (
                    <p className="mt-1.5 pl-5 text-sm text-muted-foreground">
                      {skill.description}
                    </p>
                  )}
                  <p className="mt-1 pl-5 text-xs text-muted-foreground/60 line-clamp-2 font-mono">
                    {skill.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create/Edit dialog */}
      <Dialog open={isCreating} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-lg">
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
                rows={8}
                className="font-mono text-sm"
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
    </div>
  );
});
