"use client";

import { useState } from "react";
import { X, Download, FileText, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProposalPanelStore } from "@/lib/proposal-panel-store";

export function ProposalPanel() {
  const { isOpen, data, analysis, close } = useProposalPanelStore();
  const [generating, setGenerating] = useState(false);

  if (!isOpen || !data || !analysis) return null;

  // Extract typed values from the generic analysis record
  const winProbability = Number(analysis.winProbability ?? 0);
  const dealHealthScore = Number(analysis.dealHealthScore ?? 0);
  const proposalReadiness = Number(analysis.proposalReadiness ?? 0);
  const keyDrivers = (analysis.keyDrivers ?? []) as string[];
  const riskFactors = (analysis.riskFactors ?? []) as string[];
  const rationale = analysis.rationale as Record<string, unknown> | undefined;

  async function handleGeneratePptx() {
    setGenerating(true);
    try {
      const res = await fetch("/api/crm/generate-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, analysis }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`生成エラー: ${err.error || "不明なエラー"}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const opp = (data as Record<string, unknown>).opportunity as Record<string, unknown> | undefined;
      const acc = (data as Record<string, unknown>).account as Record<string, unknown> | undefined;
      link.download = `提案書_${acc?.Name || ""}_${opp?.Name || ""}.pptx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`エラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setGenerating(false);
    }
  }

  const recommendations = (rationale?.serviceRecommendations || []) as Array<{
    service: string; relevance: string; reason: string; features: string[];
  }>;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">提案書生成</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={close}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scores */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-blue-500">{winProbability}%</div>
            <div className="text-xs text-muted-foreground">受注確率</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-green-500">{dealHealthScore}</div>
            <div className="text-xs text-muted-foreground">健全度</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-amber-500">{proposalReadiness}</div>
            <div className="text-xs text-muted-foreground">準備度</div>
          </div>
        </div>

        {keyDrivers.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 mb-2 font-medium text-sm">
              <TrendingUp className="h-4 w-4 text-green-500" />
              成功要因
            </h3>
            <ul className="space-y-1">
              {keyDrivers.map((d, i) => (
                <li key={i} className="text-sm text-muted-foreground">• {d}</li>
              ))}
            </ul>
          </div>
        )}

        {riskFactors.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 mb-2 font-medium text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              リスク要因
            </h3>
            <ul className="space-y-1">
              {riskFactors.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">• {r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Services */}
        {recommendations.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 mb-2 font-medium text-sm">
              <Target className="h-4 w-4 text-blue-500" />
              推薦サービス
            </h3>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{rec.service}</span>
                    <Badge variant={rec.relevance === "primary" ? "default" : "secondary"} className="text-xs">
                      {rec.relevance}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Combined Solution */}
        {typeof rationale?.combinedSolution === "string" && rationale.combinedSolution && (
          <div>
            <h3 className="mb-2 font-medium text-sm">総合ソリューション</h3>
            <p className="text-sm text-muted-foreground">{rationale.combinedSolution}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4">
        <Button
          className="w-full"
          onClick={handleGeneratePptx}
          disabled={generating}
        >
          <Download className="mr-2 h-4 w-4" />
          {generating ? "生成中..." : "PPTX 提案書を生成"}
        </Button>
      </div>
    </div>
  );
}
