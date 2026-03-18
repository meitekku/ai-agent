"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  FileText,
  TrendingUp,
  AlertTriangle,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wand2,
  Presentation,
  CheckCircle2,
  CircleAlert,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProposalPanelStore } from "@/lib/proposal-panel-store";
import { SlidePreview } from "@/components/slide-preview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateInfo {
  id: number;
  name: string;
  serviceName: string;
  size: number;
  modified: string;
}

interface ServiceCoverage {
  service: string;
  relevance: string;
  hasTemplate: boolean;
  templateName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalPanel() {
  const {
    isOpen,
    sessionKey,
    phase,
    data,
    analysis,
    plan,
    activeSlideIndex,
    close,
    setSessionData,
    setPhase,
    setPlan,
    setActiveSlideIndex,
    updateSlide,
  } = useProposalPanelStore();

  const [generating, setGenerating] = useState(false);
  const [revising, setRevising] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reviseInput, setReviseInput] = useState("");
  const fetchedRef = useRef<string | null>(null);

  // Template check state
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [coverages, setCoverages] = useState<ServiceCoverage[]>([]);

  // Fetch session data when sessionKey changes
  useEffect(() => {
    if (!isOpen || !sessionKey || fetchedRef.current === sessionKey) return;
    fetchedRef.current = sessionKey;

    fetch(`/api/crm/proposal-session/${sessionKey}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Session fetch failed");
        const result = await res.json();
        setSessionData(result.data, result.analysis);
      })
      .catch((err) => {
        console.error("[ProposalPanel] session fetch failed:", err);
        fetchedRef.current = null;
      });
  }, [isOpen, sessionKey, setSessionData]);

  // Reset local state when panel closes
  useEffect(() => {
    if (!isOpen) {
      fetchedRef.current = null;
      setTemplates([]);
      setCoverages([]);
      setReviseInput("");
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  // Enter template check phase: fetch templates and compute coverage
  const handleStartTemplateCheck = useCallback(async () => {
    setTemplateLoading(true);
    setPhase("templateCheck");
    try {
      const res = await fetch("/api/crm/templates");
      const result = await res.json();
      const tpls: TemplateInfo[] = result.templates ?? [];
      setTemplates(tpls);

      // Compute coverage: match recommended services to templates
      const rationale = analysis?.rationale as Record<string, unknown> | undefined;
      const recs = (rationale?.serviceRecommendations ?? []) as Array<{
        service: string;
        relevance: string;
      }>;

      const coverageList: ServiceCoverage[] = recs.map((rec) => {
        // Fuzzy match: template serviceName contains service name or vice versa
        const match = tpls.find(
          (t) =>
            t.serviceName &&
            (t.serviceName.includes(rec.service) ||
              rec.service.includes(t.serviceName)),
        );
        return {
          service: rec.service,
          relevance: rec.relevance,
          hasTemplate: !!match,
          templateName: match?.name,
        };
      });
      setCoverages(coverageList);
    } catch (err) {
      console.error("[ProposalPanel] template fetch failed:", err);
      // Graceful degradation: proceed with empty templates
      setCoverages([]);
    } finally {
      setTemplateLoading(false);
    }
  }, [analysis, setPhase]);

  const handleGeneratePlan = useCallback(async () => {
    if (!sessionKey) return;
    setGenerating(true);
    setPhase("generating");
    try {
      const res = await fetch("/api/crm/proposal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`Plan生成エラー: ${err.error || "不明なエラー"}`);
        setPhase("templateCheck");
        return;
      }
      const result = await res.json();
      setPlan(result.plan);
    } catch (err) {
      alert(`エラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
      setPhase("templateCheck");
    } finally {
      setGenerating(false);
    }
  }, [sessionKey, setPhase, setPlan]);

  const handleReviseSlide = useCallback(async () => {
    if (!plan || !reviseInput.trim()) return;
    setRevising(true);
    try {
      const res = await fetch("/api/crm/proposal-revise-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          slideIndex: activeSlideIndex,
          instruction: reviseInput.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`修正エラー: ${err.error || "不明なエラー"}`);
        return;
      }
      const result = await res.json();
      updateSlide(activeSlideIndex, result.slide);
      setReviseInput("");
    } catch (err) {
      alert(`エラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setRevising(false);
    }
  }, [plan, reviseInput, activeSlideIndex, updateSlide]);

  const handleDownloadPptx = useCallback(async () => {
    if (!plan || !data) return;
    setDownloading(true);
    try {
      const opp = data.opportunity as Record<string, unknown> | undefined;
      const acc = data.account as Record<string, unknown> | undefined;
      const pptxTitle = `提案書 - ${opp?.Name || "商談"}`;
      const res = await fetch("/api/crm/proposal-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, title: pptxTitle }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`ダウンロードエラー: ${err.error || "不明なエラー"}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `提案書_${acc?.Name || ""}_${opp?.Name || ""}.pptx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`エラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setDownloading(false);
    }
  }, [plan, data]);

  if (!isOpen) return null;

  // Loading session
  if (!data || !analysis) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col border-l bg-background shadow-xl">
        <PanelHeader onClose={handleClose} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Extract analysis fields
  const winProbability = Number(analysis.winProbability ?? 0);
  const dealHealthScore = Number(analysis.dealHealthScore ?? 0);
  const proposalReadiness = Number(analysis.proposalReadiness ?? 0);
  const keyDrivers = (analysis.keyDrivers ?? []) as string[];
  const riskFactors = (analysis.riskFactors ?? []) as string[];
  const rationale = analysis.rationale as Record<string, unknown> | undefined;
  const recommendations = (rationale?.serviceRecommendations || []) as Array<{
    service: string;
    relevance: string;
    reason: string;
    features: string[];
  }>;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <PanelHeader
        phase={phase}
        onClose={handleClose}
        onBack={
          phase === "templateCheck"
            ? () => setPhase("analysis")
            : phase === "preview"
              ? () => setPhase("templateCheck")
              : undefined
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Phase: Analysis */}
        {phase === "analysis" && (
          <>
            {/* Scores */}
            <div className="grid grid-cols-3 gap-2">
              <ScoreCard value={`${winProbability}%`} label="受注確率" color="text-blue-500" />
              <ScoreCard value={String(dealHealthScore)} label="健全度" color="text-green-500" />
              <ScoreCard value={String(proposalReadiness)} label="準備度" color="text-amber-500" />
            </div>

            {keyDrivers.length > 0 && (
              <Section icon={<TrendingUp className="h-4 w-4 text-green-500" />} title="成功要因">
                {keyDrivers.map((d, i) => (
                  <li key={i} className="text-sm text-muted-foreground">{d}</li>
                ))}
              </Section>
            )}

            {riskFactors.length > 0 && (
              <Section icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="リスク要因">
                {riskFactors.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground">{r}</li>
                ))}
              </Section>
            )}

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
                        <Badge
                          variant={rec.relevance === "primary" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {rec.relevance}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {typeof rationale?.combinedSolution === "string" &&
              rationale.combinedSolution && (
                <div>
                  <h3 className="mb-2 font-medium text-sm">総合ソリューション</h3>
                  <p className="text-sm text-muted-foreground">
                    {rationale.combinedSolution}
                  </p>
                </div>
              )}
          </>
        )}

        {/* Phase: Template Check */}
        {phase === "templateCheck" && (
          <>
            {templateLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">テンプレートを確認中...</p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="mb-3 font-medium text-sm">テンプレートカバレッジ</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    推薦サービスに対応する提案テンプレートの有無を確認します。
                    テンプレートがあると、より具体的な提案書が生成されます。
                  </p>

                  {coverages.length > 0 ? (
                    <div className="space-y-2">
                      {coverages.map((c, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-3 rounded-lg border p-3 ${
                            c.hasTemplate
                              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                              : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                          }`}
                        >
                          {c.hasTemplate ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                          ) : (
                            <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {c.service}
                              </span>
                              <Badge
                                variant={c.relevance === "primary" ? "default" : "secondary"}
                                className="text-[10px] shrink-0"
                              >
                                {c.relevance}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {c.hasTemplate
                                ? `テンプレート: ${c.templateName}`
                                : "テンプレートなし（AIが汎用コンテンツで生成）"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        {templates.length === 0
                          ? "テンプレート未登録。AIが汎用コンテンツで提案書を生成します。"
                          : "推薦サービスなし。AIが汎用コンテンツで生成します。"}
                      </p>
                    </div>
                  )}
                </div>

                {templates.length > 0 && coverages.some((c) => !c.hasTemplate) && (
                  <p className="text-xs text-muted-foreground">
                    テンプレートが不足していても提案書は生成できます。
                    より高品質な提案書が必要な場合は、サービス紹介資料をアップロードしてください。
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* Phase: Generating */}
        {phase === "generating" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              スライド構成を生成中...
            </p>
          </div>
        )}

        {/* Phase: Preview */}
        {phase === "preview" && plan && (
          <>
            {/* Slide navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                disabled={activeSlideIndex === 0}
                onClick={() => setActiveSlideIndex(activeSlideIndex - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {activeSlideIndex + 1} / {plan.slides.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={activeSlideIndex === plan.slides.length - 1}
                onClick={() => setActiveSlideIndex(activeSlideIndex + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Slide title */}
            <div className="text-center">
              <span className="text-xs text-muted-foreground">
                {plan.slides[activeSlideIndex]?.layout}
              </span>
              <h3 className="text-sm font-medium truncate">
                {plan.slides[activeSlideIndex]?.title}
              </h3>
            </div>

            {/* Slide preview */}
            <SlidePreview plan={plan} slideIndex={activeSlideIndex} />

            {/* Slide thumbnails */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {plan.slides.map((slide, i) => (
                <button
                  key={i}
                  className={`shrink-0 rounded border p-0.5 transition-colors ${
                    i === activeSlideIndex
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-foreground/30"
                  }`}
                  onClick={() => setActiveSlideIndex(i)}
                >
                  <div
                    className="w-16 text-[4px] leading-tight truncate px-1 py-0.5 rounded-sm"
                    style={{
                      aspectRatio: "16/9",
                      backgroundColor: `#${slide.bgColor || plan.theme.background}`,
                      color: `#${plan.theme.text}`,
                    }}
                  >
                    {slide.title}
                  </div>
                </button>
              ))}
            </div>

            {/* Revise input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                このスライドの修正指示
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="例: KPI カードを追加して..."
                  value={reviseInput}
                  onChange={(e) => setReviseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleReviseSlide();
                    }
                  }}
                  disabled={revising}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleReviseSlide}
                  disabled={revising || !reviseInput.trim()}
                >
                  {revising ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 space-y-2">
        {phase === "analysis" && (
          <Button
            className="w-full"
            onClick={handleStartTemplateCheck}
          >
            <Presentation className="mr-2 h-4 w-4" />
            スライド構成を生成
          </Button>
        )}
        {phase === "templateCheck" && !templateLoading && (
          <Button
            className="w-full"
            onClick={handleGeneratePlan}
            disabled={generating}
          >
            <Presentation className="mr-2 h-4 w-4" />
            {generating ? "生成中..." : "確認して生成する"}
          </Button>
        )}
        {phase === "preview" && plan && (
          <Button
            className="w-full"
            onClick={handleDownloadPptx}
            disabled={downloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "ダウンロード中..." : "PPTX ダウンロード"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PanelHeader({
  phase,
  onClose,
  onBack,
}: {
  phase?: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <FileText className="h-5 w-5" />
        <h2 className="text-lg font-semibold">提案書生成</h2>
        {phase === "templateCheck" && (
          <Badge variant="outline" className="text-xs">テンプレート確認</Badge>
        )}
        {phase === "preview" && (
          <Badge variant="secondary" className="text-xs">プレビュー</Badge>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ScoreCard({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 mb-2 font-medium text-sm">
        {icon}
        {title}
      </h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
