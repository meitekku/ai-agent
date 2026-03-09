"use client";

import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";
import { useState } from "react";

export interface StyleOptions {
  industry?: string;
  profession?: string;
  ageGroup?: string;
  colorStyle?: string;
  font?: string;
}

// ============================================================
// Option definitions
// ============================================================

type CategoryDef = {
  key: keyof StyleOptions;
  label: string;
  options: string[];
  hasOther: boolean;
};

const CATEGORIES: CategoryDef[] = [
  {
    key: "industry",
    label: "産業",
    options: [
      "流通・小売",
      "製造",
      "金融・保険",
      "IT・通信",
      "医療・ヘルスケア",
      "教育",
      "不動産・建設",
      "エネルギー",
      "政府・公共",
      "エンタメ・メディア",
    ],
    hasOther: true,
  },
  {
    key: "profession",
    label: "職種",
    options: [
      "人事",
      "営業",
      "経営企画",
      "マーケティング",
      "管理・経理",
      "設計・開発",
      "研究・R&D",
      "カスタマーサポート",
      "コンサルティング",
    ],
    hasOther: true,
  },
  {
    key: "ageGroup",
    label: "年代層",
    options: ["10代〜20代", "30代〜40代", "50代以上", "全年代"],
    hasOther: true,
  },
  {
    key: "colorStyle",
    label: "色スタイル",
    options: [
      "ブルー",
      "グリーン",
      "ピンク",
      "イエロー",
      "パープル",
      "レッド",
      "モノクロ",
      "ダーク",
    ],
    hasOther: true,
  },
  {
    key: "font",
    label: "フォント",
    options: [
      "ゴシック体 (Noto Sans JP, Hiragino Sans)",
      "明朝体 (Noto Serif JP, Hiragino Mincho)",
      "丸ゴシック (Rounded Mplus 1c)",
      "モノスペース (Source Code Pro, Noto Sans Mono)",
    ],
    hasOther: false,
  },
];

// ============================================================
// Auto-detect style from content
// ============================================================

type KeywordRule = { value: string; keywords: string[] };

const INDUSTRY_RULES: KeywordRule[] = [
  { value: "IT・通信", keywords: ["IT", "ソフトウェア", "プログラミング", "AI", "システム", "ネットワーク", "クラウド", "API", "データベース", "サーバー", "アプリ", "DX", "SaaS", "IoT", "セキュリティ", "ブロックチェーン", "機械学習", "ディープラーニング", "アルゴリズム", "コンピュータ"] },
  { value: "医療・ヘルスケア", keywords: ["医療", "病院", "健康", "患者", "治療", "薬", "ヘルスケア", "看護", "医師", "臨床", "疾患", "診断", "手術", "医薬品", "介護", "ウイルス", "細菌", "免疫", "ワクチン"] },
  { value: "教育", keywords: ["教育", "学校", "学生", "授業", "学習", "教師", "大学", "研究", "カリキュラム", "試験", "入学", "塾", "講義", "教科書", "留学"] },
  { value: "金融・保険", keywords: ["金融", "銀行", "保険", "投資", "ファイナンス", "株式", "資産", "融資", "利率", "為替", "証券", "ファンド", "リスク管理", "決済", "フィンテック"] },
  { value: "製造", keywords: ["製造", "工場", "生産", "品質管理", "サプライチェーン", "部品", "設備", "ロボット", "自動化", "検査", "組立", "材料", "歩留まり"] },
  { value: "流通・小売", keywords: ["小売", "店舗", "EC", "販売", "購買", "ショッピング", "流通", "商品", "在庫", "物流", "配送", "POS", "マーチャンダイジング"] },
  { value: "エネルギー", keywords: ["エネルギー", "電力", "太陽光", "原子力", "石油", "ガス", "再生可能", "発電", "蓄電", "カーボン", "脱炭素", "CO2"] },
  { value: "不動産・建設", keywords: ["不動産", "建設", "建築", "住宅", "マンション", "物件", "施工", "設計", "都市計画", "土地"] },
  { value: "政府・公共", keywords: ["政府", "行政", "公共", "自治体", "政策", "法律", "規制", "条例", "議会", "官公庁", "公務員"] },
  { value: "エンタメ・メディア", keywords: ["エンタメ", "メディア", "映画", "音楽", "ゲーム", "配信", "コンテンツ", "アニメ", "漫画", "動画", "YouTube", "ストリーミング"] },
];

const PROFESSION_RULES: KeywordRule[] = [
  { value: "設計・開発", keywords: ["開発", "エンジニア", "プログラマー", "コーディング", "設計", "実装", "アーキテクチャ", "フロントエンド", "バックエンド", "デバッグ", "テスト", "リファクタリング"] },
  { value: "研究・R&D", keywords: ["研究", "R&D", "論文", "実験", "分析", "仮説", "検証", "学術", "博士", "ラボ", "解析"] },
  { value: "マーケティング", keywords: ["マーケティング", "広告", "ブランド", "プロモーション", "SNS", "SEO", "コンバージョン", "ターゲット", "キャンペーン", "認知度"] },
  { value: "営業", keywords: ["営業", "セールス", "商談", "契約", "提案書", "受注", "クロージング", "リード"] },
  { value: "経営企画", keywords: ["経営", "戦略", "事業計画", "企画", "ビジョン", "KPI", "中期計画", "経営戦略", "M&A"] },
  { value: "人事", keywords: ["人事", "採用", "研修", "人材", "組織", "評価", "労務", "福利厚生", "オンボーディング"] },
  { value: "管理・経理", keywords: ["経理", "会計", "予算", "財務", "決算", "税務", "監査", "コスト管理", "損益"] },
  { value: "カスタマーサポート", keywords: ["サポート", "問い合わせ", "顧客対応", "CS", "ヘルプデスク", "チケット", "FAQ"] },
  { value: "コンサルティング", keywords: ["コンサル", "アドバイザリー", "提案", "課題解決", "フレームワーク", "SWOT"] },
];

// Industry → recommended color mapping
const INDUSTRY_COLOR_MAP: Record<string, string> = {
  "IT・通信": "ブルー",
  "医療・ヘルスケア": "グリーン",
  "教育": "イエロー",
  "金融・保険": "ブルー",
  "製造": "モノクロ",
  "流通・小売": "レッド",
  "エネルギー": "グリーン",
  "不動産・建設": "モノクロ",
  "政府・公共": "ブルー",
  "エンタメ・メディア": "パープル",
};

function matchKeywords(text: string, rules: KeywordRule[]): string | undefined {
  let best: { value: string; count: number } | null = null;
  for (const rule of rules) {
    let count = 0;
    for (const kw of rule.keywords) {
      // Case-insensitive match
      const regex = new RegExp(kw, "gi");
      const matches = text.match(regex);
      if (matches) count += matches.length;
    }
    if (count > 0 && (!best || count > best.count)) {
      best = { value: rule.value, count };
    }
  }
  return best?.value;
}

/**
 * Infer style options from question + answer text content.
 * Returns partial StyleOptions — only fields with detected values.
 */
export function inferStyleFromContent(question: string, answer: string): StyleOptions {
  const text = `${question} ${answer}`;
  const result: StyleOptions = {};

  const industry = matchKeywords(text, INDUSTRY_RULES);
  if (industry) {
    result.industry = industry;
    // Suggest color based on industry
    const color = INDUSTRY_COLOR_MAP[industry];
    if (color) result.colorStyle = color;
  }

  const profession = matchKeywords(text, PROFESSION_RULES);
  if (profession) result.profession = profession;

  return result;
}

// ============================================================
// Component
// ============================================================

interface StyleOptionsPanelProps {
  value: StyleOptions;
  onChange: (value: StyleOptions) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export function StyleOptionsPanel({
  value,
  onChange,
  className,
  defaultExpanded = false,
}: StyleOptionsPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Track which categories have "その他" selected (by key)
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  const hasValues = !!(
    value.industry ||
    value.profession ||
    value.ageGroup ||
    value.colorStyle ||
    value.font
  );

  const isOtherSelected = (cat: CategoryDef): boolean => {
    const v = value[cat.key];
    if (!v) return false;
    return !cat.options.includes(v);
  };

  const handleSelect = (cat: CategoryDef, option: string) => {
    const current = value[cat.key];
    // Toggle off if already selected
    if (current === option) {
      onChange({ ...value, [cat.key]: undefined });
    } else {
      onChange({ ...value, [cat.key]: option });
    }
  };

  const handleOtherToggle = (cat: CategoryDef) => {
    if (isOtherSelected(cat)) {
      // Deselect other
      onChange({ ...value, [cat.key]: undefined });
    } else {
      // Select other with existing text or empty
      const text = otherTexts[cat.key] || "";
      onChange({ ...value, [cat.key]: text || undefined });
    }
  };

  const handleOtherTextChange = (cat: CategoryDef, text: string) => {
    setOtherTexts((prev) => ({ ...prev, [cat.key]: text }));
    onChange({ ...value, [cat.key]: text || undefined });
  };

  return (
    <div className={cn("", className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors",
          hasValues
            ? "bg-primary/15 text-primary border border-primary/30"
            : "bg-secondary text-muted-foreground hover:text-foreground",
        )}
      >
        <Palette className="w-3.5 h-3.5" />
        スタイル
        {hasValues && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-secondary/30 border border-border/50 rounded-lg space-y-3 animate-fade-in">
          {CATEGORIES.map((cat) => {
            const selected = value[cat.key];
            const otherActive = isOtherSelected(cat);

            return (
              <div key={cat.key} className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium">{cat.label}</span>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {cat.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSelect(cat, opt)}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors whitespace-nowrap",
                        selected === opt
                          ? "bg-primary/15 text-primary border-primary/30 font-medium"
                          : "bg-card text-foreground/85 border-border hover:border-primary/30 hover:text-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                  {cat.hasOther && (
                    <>
                      <button
                        onClick={() => handleOtherToggle(cat)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] rounded-md border transition-colors whitespace-nowrap",
                          otherActive
                            ? "bg-primary/15 text-primary border-primary/30 font-medium"
                            : "bg-card text-foreground/85 border-border hover:border-primary/30 hover:text-foreground",
                        )}
                      >
                        その他
                      </button>
                      <input
                        type="text"
                        disabled={!otherActive}
                        value={otherActive ? (otherTexts[cat.key] ?? selected ?? "") : ""}
                        onChange={(e) => handleOtherTextChange(cat, e.target.value)}
                        placeholder="入力..."
                        className={cn(
                          "w-24 px-1.5 py-0.5 text-[11px] border rounded-md transition-colors",
                          otherActive
                            ? "bg-card border-primary/30 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                            : "bg-secondary/50 border-border text-foreground/25 cursor-not-allowed",
                        )}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
