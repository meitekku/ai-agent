"use client";

import { memo, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeftIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
  NetworkIcon,
  CircleDotIcon,
  LinkIcon,
  LayersIcon,
} from "lucide-react";
import type { GraphData, GraphNode } from "@/lib/rag-client";

// Dynamic import to avoid SSR for R3F
const GraphCanvas = dynamic(
  () => import("./graph-canvas").then((m) => ({ default: m.GraphCanvas })),
  { ssr: false },
);

async function fetchGraph(slug: string): Promise<GraphData> {
  const res = await fetch(`/api/graph/${slug}`);
  if (!res.ok) throw new Error("グラフの取得に失敗しました");
  return res.json();
}

async function fetchKBName(slug: string): Promise<string> {
  try {
    const res = await fetch(`/api/kbs/${slug}`);
    if (!res.ok) return slug;
    const data = await res.json();
    return data.name || slug;
  } catch {
    return slug;
  }
}

export const GraphPage = memo(function GraphPage({ slug }: { slug: string }) {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: kbName } = useQuery({
    queryKey: ["kb-name", slug],
    queryFn: () => fetchKBName(slug),
  });

  const {
    data,
    isPending: loading,
    isError,
  } = useQuery({
    queryKey: ["graph", slug],
    queryFn: () => fetchGraph(slug),
    staleTime: 60_000,
  });

  // Search filter
  const searchResults = useMemo(() => {
    if (!search.trim() || !data) return [];
    const q = search.toLowerCase();
    return data.nodes
      .filter((n) => n.id.toLowerCase().includes(q))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 20);
  }, [search, data]);

  const selectedNode = useMemo(() => {
    if (!selectedId || !data) return null;
    return data.nodes.find((n) => n.id === selectedId) ?? null;
  }, [selectedId, data]);

  // Edges connected to selected node
  const selectedEdges = useMemo(() => {
    if (!selectedId || !data) return [];
    return data.links.filter(
      (l) => l.source === selectedId || l.target === selectedId,
    );
  }, [selectedId, data]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-3">
          <Loader2Icon className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            グラフを読み込み中...
          </p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#030712]">
        <p className="text-sm text-muted-foreground">
          グラフの取得に失敗しました
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeftIcon className="size-4 mr-1.5" />
          戻る
        </Button>
      </div>
    );
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#030712]">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <NetworkIcon className="size-7 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">
            ナレッジグラフが空です
          </p>
          <p className="text-sm text-muted-foreground">
            ドキュメントをアップロードしてグラフを構築しましょう
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(`/documents/${slug}`)}>
          <ArrowLeftIcon className="size-4 mr-1.5" />
          ドキュメント管理に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden">
      {/* 3D Canvas — full screen */}
      <div className="absolute inset-0">
        <GraphCanvas
          data={data}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onHover={setHoveredId}
          onSelect={handleSelect}
        />
      </div>

      {/* Top bar overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center gap-3 px-4 py-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => router.push(`/documents/${slug}`)}
            className="flex size-8 items-center justify-center rounded-lg bg-black/50 backdrop-blur-sm text-muted-foreground transition-colors hover:bg-black/70 hover:text-foreground ring-1 ring-white/10"
            aria-label="戻る"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <div className="flex items-center gap-2 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 ring-1 ring-white/10">
            <NetworkIcon className="size-4 text-primary" />
            <span className="text-sm font-medium">{kbName ?? slug}</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 ml-auto">
            <StatBadge icon={CircleDotIcon} value={data.stats.node_count} label="ノード" />
            <StatBadge icon={LinkIcon} value={data.stats.edge_count} label="エッジ" />
            <StatBadge icon={LayersIcon} value={data.stats.community_count} label="コミュニティ" />
          </div>
        </div>
      </div>

      {/* Search overlay */}
      <div className="absolute top-14 left-4 z-10 w-72">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="エンティティを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-black/60 backdrop-blur-sm border-white/10 text-sm h-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="mt-1 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10 overflow-hidden">
            <ScrollArea className="max-h-60">
              {searchResults.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  onClick={() => {
                    handleSelect(n.id);
                    setSearch("");
                  }}
                >
                  <span className="truncate block">{n.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {n.entity_type && `${n.entity_type} · `}
                    接続数 {n.degree}
                  </span>
                </button>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Detail panel — right side */}
      {selectedNode && (
        <div className="absolute top-14 right-4 bottom-4 z-10 w-80">
          <div className="h-full rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold truncate">
                {selectedNode.id}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-3 space-y-4 break-words">
                {/* Meta */}
                <div className="space-y-2">
                  {selectedNode.entity_type && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        タイプ
                      </p>
                      <p className="text-sm">{selectedNode.entity_type}</p>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        接続数
                      </p>
                      <p className="text-sm font-medium">
                        {selectedNode.degree}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        コミュニティ
                      </p>
                      <p className="text-sm font-medium">
                        #{selectedNode.community}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedNode.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">説明</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedNode.description}
                    </p>
                  </div>
                )}

                {/* Connected edges */}
                {selectedEdges.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      関連エッジ ({selectedEdges.length})
                    </p>
                    <div className="space-y-1.5">
                      {selectedEdges.slice(0, 30).map((edge, i) => {
                        const other =
                          edge.source === selectedId
                            ? edge.target
                            : edge.source;
                        return (
                          <button
                            key={i}
                            type="button"
                            className="w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors"
                            onClick={() => handleSelect(other)}
                          >
                            <span className="font-medium text-primary/80">
                              {other}
                            </span>
                            {edge.description && (
                              <span className="block text-muted-foreground mt-0.5 line-clamp-2">
                                {edge.description}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Stat badge
// ---------------------------------------------------------------------------

function StatBadge({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof CircleDotIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-2.5 py-1.5 ring-1 ring-white/10">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-xs font-medium">{value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
