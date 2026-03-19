"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  FileText,
  TrendingUp,
  AlertTriangle,
  Target,
  Loader2,
  Presentation,
  CheckCircle2,
  CircleAlert,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProposalPanelStore } from "@/lib/proposal-panel-store";
import {
  StyleOptionsPanel,
  type StyleOptions,
  INDUSTRY_COLOR_MAP,
} from "@/components/style-options-panel";

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
// buildProposalContent — convert CRM analysis to structured text for SlidePanel
// ---------------------------------------------------------------------------

function buildProposalContent(
  data: Record<string, unknown>,
  analysis: Record<string, unknown>,
): string {
  const account = (data.account ?? {}) as Record<string, unknown>;
  const opportunity = (data.opportunity ?? {}) as Record<string, unknown>;
  const rationale = (analysis.rationale ?? {}) as Record<string, unknown>;
  const recs = (rationale.serviceRecommendations ?? []) as Array<{
    service: string;
    relevance: string;
    reason: string;
    features: string[];
  }>;
  const keyDrivers = (analysis.keyDrivers ?? []) as string[];
  const riskFactors = (analysis.riskFactors ?? []) as string[];
  const winProb = analysis.winProbability ?? 0;
  const healthScore = analysis.dealHealthScore ?? 0;

  const lines: string[] = [];

  // Customer overview
  lines.push(`# ${account.Name || "顧客"} 向け提案書`);
  lines.push("");
  lines.push("## 顧客概要");
  if (account.Name) lines.push(`- 会社名: ${account.Name}`);
  if (account.Industry) lines.push(`- 業種: ${account.Industry}`);
  if (account.NumberOfEmployees)
    lines.push(`- 従業員数: ${account.NumberOfEmployees}名`);
  if (opportunity.Name) lines.push(`- 案件名: ${opportunity.Name}`);
  if (opportunity.Amount)
    lines.push(
      `- 予算: ${Number(opportunity.Amount).toLocaleString()}円`,
    );
  if (opportunity.StageName)
    lines.push(`- ステージ: ${opportunity.StageName}`);
  lines.push("");

  // Scores
  lines.push("## 商談スコア");
  lines.push(`- 受注確率: ${winProb}%`);
  lines.push(`- 健全度: ${healthScore}`);
  lines.push("");

  // Key drivers
  if (keyDrivers.length > 0) {
    lines.push("## 成功要因");
    for (const d of keyDrivers) lines.push(`- ${d}`);
    lines.push("");
  }

  // Risk factors
  if (riskFactors.length > 0) {
    lines.push("## リスク要因");
    for (const r of riskFactors) lines.push(`- ${r}`);
    lines.push("");
  }

  // Recommendations
  if (recs.length > 0) {
    lines.push("## 推薦ソリューション");
    for (const rec of recs) {
      lines.push(`### ${rec.service}（${rec.relevance}）`);
      lines.push(rec.reason);
      if (rec.features?.length > 0) {
        for (const f of rec.features) lines.push(`- ${f}`);
      }
      lines.push("");
    }
  }

  // Combined solution
  if (typeof rationale.combinedSolution === "string" && rationale.combinedSolution) {
    lines.push("## 総合ソリューション");
    lines.push(rationale.combinedSolution);
    lines.push("");
  }

  // KPIs
  const kpis = (rationale.expectedKPIs ?? []) as string[];
  if (kpis.length > 0) {
    lines.push("## 期待される KPI");
    for (const k of kpis) lines.push(`- ${k}`);
    lines.push("");
  }

  // Action items
  const actions = (rationale.nextActions ?? rationale.actionItems ?? []) as string[];
  if (actions.length > 0) {
    lines.push("## アクションプラン");
    for (const a of actions) lines.push(`- ${a}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build template instructions from matched templates
// ---------------------------------------------------------------------------

function buildTemplateInstructions(
  coverages: ServiceCoverage[],
  templates: TemplateInfo[],
): string | null {
  const matched = coverages.filter((c) => c.hasTemplate);
  if (matched.length === 0) return null;
  const lines = ["以下のサービステンプレートを参考にしてください："];
  for (const c of matched) {
    const tpl = templates.find((t) => t.name === c.templateName);
    if (tpl) {
      lines.push(`- ${c.service}: テンプレート「${tpl.name}」`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProposalPanelProps {
  onOpenSlidePanel: (
    question: string,
    answer: string,
    instructions: string | null,
    styleOptions: StyleOptions | null,
  ) => void;
}

export function ProposalPanel({ onOpenSlidePanel }: ProposalPanelProps) {
  const {
    isOpen,
    sessionKey,
    phase,
    data,
    analysis,
    styleOptions,
    close,
    setSessionData,
    setPhase,
    setStyleOptions,
  } = useProposalPanelStore();

  const fetchedRef = useRef<string | null>(null);

  // Template check state
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [coverages, setCoverages] = useState<ServiceCoverage[]>([]);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(480);
  const panelResizingRef = useRef(false);
  const panelResizeStartXRef = useRef(0);
  const panelResizeStartWRef = useRef(480);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
      setCoverages([]);
    } finally {
      setTemplateLoading(false);
    }
  }, [analysis, setPhase]);

  // Enter style setup phase: auto-infer style from CRM data
  const handleStartStyleSetup = useCallback(() => {
    setPhase("styleSetup");
    // Auto-infer industry from account data
    const account = (data?.account ?? {}) as Record<string, unknown>;
    const industry = typeof account.Industry === "string" ? account.Industry : "";
    if (industry && !styleOptions.industry) {
      const inferredOpts: StyleOptions = { ...styleOptions };
      inferredOpts.industry = industry;
      const color = INDUSTRY_COLOR_MAP[industry];
      if (color) inferredOpts.colorStyle = color;
      setStyleOptions(inferredOpts);
    }
  }, [data, styleOptions, setPhase, setStyleOptions]);

  // Generate slides: build content and open SlidePanel
  const handleGenerateSlides = useCallback(() => {
    if (!data || !analysis) return;

    const account = (data.account ?? {}) as Record<string, unknown>;
    const opportunity = (data.opportunity ?? {}) as Record<string, unknown>;
    const question = `${account.Name || "顧客"} - ${opportunity.Name || "案件"} 提案書`;
    const answer = buildProposalContent(data, analysis);
    const instructions = buildTemplateInstructions(coverages, templates);

    const opts = Object.keys(styleOptions).length > 0 ? styleOptions : null;

    close(); // close ProposalPanel
    onOpenSlidePanel(question, answer, instructions, opts);
  }, [data, analysis, coverages, templates, styleOptions, close, onOpenSlidePanel]);

  // Panel resize handlers
  const handlePanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      panelResizingRef.current = true;
      panelResizeStartXRef.current = e.clientX;
      panelResizeStartWRef.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!panelResizingRef.current) return;
        const delta = panelResizeStartXRef.current - ev.clientX;
        const newW = Math.max(360, Math.min(700, panelResizeStartWRef.current + delta));
        setPanelWidth(newW);
      };
      const onUp = () => {
        panelResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [panelWidth],
  );

  if (!isOpen) return null;

  // Loading session
  if (!data || !analysis) {
    return (
      <PanelShell
        isMobile={isMobile}
        panelWidth={panelWidth}
        onResizeStart={handlePanelResizeStart}
      >
        <PanelHeader onClose={handleClose} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PanelShell>
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
    <PanelShell
      isMobile={isMobile}
      panelWidth={panelWidth}
      onResizeStart={handlePanelResizeStart}
    >
      {/* Header */}
      <PanelHeader
        phase={phase}
        onClose={handleClose}
        onBack={
          phase === "templateCheck"
            ? () => setPhase("analysis")
            : phase === "styleSetup"
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

        {/* Phase: Style Setup */}
        {phase === "styleSetup" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-medium text-sm">スライドスタイル設定</h3>
              <p className="text-xs text-muted-foreground mb-3">
                提案書のスタイルを選択してください。CRM データから自動推定されています。
              </p>
            </div>
            <StyleOptionsPanel
              value={styleOptions}
              onChange={setStyleOptions}
              defaultExpanded
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 space-y-2">
        {phase === "analysis" && (
          <Button
            className="w-full"
            onClick={handleStartTemplateCheck}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            次へ（テンプレート確認）
          </Button>
        )}
        {phase === "templateCheck" && !templateLoading && (
          <Button
            className="w-full"
            onClick={handleStartStyleSetup}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            次へ（スタイル設定）
          </Button>
        )}
        {phase === "styleSetup" && (
          <Button
            className="w-full"
            onClick={handleGenerateSlides}
          >
            <Presentation className="mr-2 h-4 w-4" />
            スライド生成
          </Button>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// PanelShell — flex sibling or mobile full-screen overlay
// ---------------------------------------------------------------------------

function PanelShell({
  isMobile,
  panelWidth,
  onResizeStart,
  children,
}: {
  isMobile: boolean;
  panelWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
      style={{ width: panelWidth }}
    >
      {/* Resize handle (left edge) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={onResizeStart}
      />
      {children}
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
        {phase === "styleSetup" && (
          <Badge variant="secondary" className="text-xs">スタイル設定</Badge>
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
