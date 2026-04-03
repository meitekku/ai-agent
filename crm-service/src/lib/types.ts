export type DataSource = "salesforce" | "kintone" | "file" | "manual";

export interface SFCredentials {
  username: string;
  password: string;
  securityToken: string;
  loginUrl: string;
}

export interface KintoneCredentials {
  subdomain: string;
  apiToken: string;
  appId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type R = Record<string, any>;

export interface SFData {
  account: { Name?: string; Industry?: string; Description?: string; [k: string]: unknown };
  opportunity: {
    Id?: string; Name?: string; Amount?: number; StageName?: string; CloseDate?: string;
    Probability?: number; Description?: string; LeadSource?: string; Type?: string;
    CreatedDate?: string; NextStep?: string; [k: string]: unknown;
  };
  activities: R[];
  contacts: R[];
  events?: R[];
  feedItems?: R[];
  notes?: R[];
  cases?: R[];
  contracts?: R[];
  quotes?: R[];
  lineItems?: R[];
  emails?: R[];
  _meta?: { objectType: string; availableObjects: string[]; fetchedAt: string };
}

export interface ScenarioResult {
  label: string;
  probability: number;
  expectedRevenue: number;
  timeline: string;
  conditions: string[];
}

export interface ServiceRecommendation {
  service: string;
  relevance: "primary" | "secondary" | "optional";
  reason: string;
  features: string[];
}

export type ProposalJudgment = "existing_service" | "dx_development" | "not_proposable";

export interface AnalysisRationale {
  customerChallenges: string[];
  serviceRecommendations: ServiceRecommendation[];
  combinedSolution: string;
  existingProposalHints: string[];
  proposalJudgment: ProposalJudgment;
  proposalJudgmentReason: string;
  // AI-generated overrides for algorithmic defaults
  keyDrivers?: string[];
  riskFactors?: string[];
  recommendedActions?: string[];
}

export interface AnalysisResult {
  winProbability: number;
  dealHealthScore: number;
  activityScore: number;
  engagementLevel: string;
  proposalReadiness: number;
  scenarios: {
    optimistic: ScenarioResult;
    base: ScenarioResult;
    pessimistic: ScenarioResult;
  };
  keyDrivers: string[];
  riskFactors: string[];
  recommendedActions: string[];
  rationale: AnalysisRationale;
}

export interface OpportunityListItem {
  Id: string;
  Name: string;
  Amount: number;
  StageName: string;
  CloseDate: string;
  AccountName: string;
}

export interface DealRecord {
  companyName: string;
  dealName: string;
  amount: number;
  stage: string;
  closeDate: string;
  industry: string;
  description: string;
  contacts: string;
  [key: string]: unknown;
}

export interface SlideElement {
  type: "text" | "shape" | "list" | "kpi" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  items?: string[];
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  fill?: string;
  borderColor?: string;
  label?: string;
  value?: string;
  valueColor?: string;
  rows?: string[][];
  headerBg?: string;
}

export interface SlideDefinition {
  title: string;
  subtitle?: string;
  layout: "title" | "content" | "two-column" | "cards" | "closing";
  bgColor: string;
  headerColor: string;
  elements: SlideElement[];
}

export interface PresentationPlan {
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    lightText: string;
  };
  slides: SlideDefinition[];
}

export interface TemplateInfo {
  id: number;
  name: string;
  serviceName: string;
  size: number;
  modified: string;
}
