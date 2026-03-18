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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SearchIcon,
  DownloadIcon,
  CheckCircleIcon,
  GlobeIcon,
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
  source_type?: "manual" | "zip" | "registry";
  registry_id?: string;
  created_at: string;
  updated_at: string;
}

interface RegistrySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

async function fetchSkills(): Promise<Skill[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("Failed to fetch skills");
  const data = await res.json();
  return data.skills || [];
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// SkillsPage
// ---------------------------------------------------------------------------

export const SkillsPage = memo(function SkillsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("local");
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");

  // Registry state
  const [searchInput, setSearchInput] = useState("");
  const [registryQuery, setRegistryQuery] = useState("");

  const { data: skills = [], isPending: loading } = useQuery({
    queryKey: ["skills"],
    queryFn: fetchSkills,
  });

  const enabledCount = skills.filter((s) => s.enabled).length;

  // Registry search
  const { data: registryData, isPending: registryLoading } = useQuery({
    queryKey: ["skills-registry", registryQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/skills/registry?q=${encodeURIComponent(registryQuery)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<{
        skills: RegistrySkill[];
        installed: string[];
      }>;
    },
    enabled: !!registryQuery,
  });

  const registrySkills = registryData?.skills || [];
  const installedIds = new Set(registryData?.installed || []);

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      content: string;
    }) => {
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
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      content?: string;
      enabled?: boolean;
    }) => {
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
      const res = await fetch("/api/skills/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });

  const installMutation = useMutation({
    mutationFn: async (data: { source: string; skillId: string }) => {
      const res = await fetch("/api/skills/registry/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Install failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["skills-registry"] });
    },
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
        old?.map((s) =>
          s.id === skill.id ? { ...s, enabled: !s.enabled } : s,
        ),
      );
      updateMutation.mutate(
        { id: skill.id, enabled: !skill.enabled },
        {
          onError: () =>
            queryClient.invalidateQueries({ queryKey: ["skills"] }),
        },
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
  }, [
    formName,
    formDescription,
    formContent,
    editingSkill,
    createMutation,
    updateMutation,
  ]);

  const confirmDelete = useCallback(
    (skill: Skill) => {
      setDeleteTarget(null);
      deleteMutation.mutate(skill.id);
    },
    [deleteMutation],
  );

  const handleRegistrySearch = useCallback(() => {
    const q = searchInput.trim();
    if (q) setRegistryQuery(q);
  }, [searchInput]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleRegistrySearch();
    },
    [handleRegistrySearch],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-1 flex-col min-h-0"
    >
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                スキル
              </h2>
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
            {activeTab === "local" && (
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
            )}
          </div>
          <TabsList className="mt-4">
            <TabsTrigger value="local">マイスキル</TabsTrigger>
            <TabsTrigger value="registry" className="gap-1.5">
              <GlobeIcon className="size-3.5" />
              skills.sh
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      {/* Local skills tab */}
      <TabsContent
        value="local"
        className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
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
                    ドメイン知識やワークフロー指示を追加して、AI
                    の回答をカスタマイズしましょう
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
                          skill.enabled
                            ? "bg-primary"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                      <span className="flex-1 text-sm font-medium">
                        {skill.name}
                        {skill.source_type === "zip" && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] px-1.5 py-0 font-normal"
                          >
                            ZIP
                          </Badge>
                        )}
                        {skill.source_type === "registry" && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] px-1.5 py-0 font-normal"
                          >
                            skills.sh
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
      </TabsContent>

      {/* Registry tab */}
      <TabsContent
        value="registry"
        className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
        <div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-2 shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="スキルを検索（例: react, typescript, testing）"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex-1"
            />
            <Button
              onClick={handleRegistrySearch}
              disabled={!searchInput.trim() || registryLoading}
              className="gap-2 shrink-0"
            >
              {registryLoading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SearchIcon className="size-4" />
              )}
              検索
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl px-6 py-2">
            {!registryQuery ? (
              <RegistryEmptyState onSearch={(q) => { setSearchInput(q); setRegistryQuery(q); }} />
            ) : registryLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : registrySkills.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  「{registryQuery}」に一致するスキルが見つかりません
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {registrySkills.map((rs) => {
                  const regId = `${rs.source}/${rs.skillId}`;
                  const installed = installedIds.has(regId);
                  const installing =
                    installMutation.isPending &&
                    installMutation.variables?.skillId === rs.skillId;

                  return (
                    <div
                      key={rs.id}
                      className="rounded-lg border border-border/50 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {rs.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal shrink-0"
                            >
                              {formatInstalls(rs.installs)} installs
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {rs.source}
                          </p>
                        </div>
                        {installed ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs shrink-0 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                          >
                            <CheckCircleIcon className="size-3" />
                            インストール済
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 shrink-0"
                            disabled={installing}
                            onClick={() =>
                              installMutation.mutate({
                                source: rs.source,
                                skillId: rs.skillId,
                              })
                            }
                          >
                            {installing ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <DownloadIcon className="size-3.5" />
                            )}
                            インストール
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {installMutation.isError && (
              <p className="mt-3 text-sm text-destructive text-center">
                {installMutation.error.message}
              </p>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Create/Edit dialog */}
      <Dialog open={isCreating} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? "スキルを編集" : "新規スキル"}
            </DialogTitle>
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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
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
    </Tabs>
  );
});

// ---------------------------------------------------------------------------
// Registry empty state with suggested searches
// ---------------------------------------------------------------------------

function RegistryEmptyState({ onSearch }: { onSearch: (q: string) => void }) {
  const suggestions = [
    "marketing",
    "copywriting",
    "seo",
    "branding",
    "social media",
    "analytics",
    "email marketing",
    "content strategy",
  ];

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
        <GlobeIcon className="size-6 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">skills.sh レジストリ</p>
        <p className="text-sm text-muted-foreground">
          コミュニティが公開しているスキルを検索してインストール
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        {suggestions.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onSearch(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
