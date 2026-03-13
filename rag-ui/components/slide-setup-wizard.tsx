"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  INDUSTRY_COLOR_MAP,
  inferStyleFromContent,
  type StyleOptions,
} from "@/components/style-options-panel";
import {
  XIcon,
  FileTextIcon,
  BuildingIcon,
  UsersIcon,
  PaletteIcon,
  HashIcon,
  MessageSquareIcon,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface WizardConfig {
  topic: string;
  industries: string[];
  audience: string[];
  colorStyle: string;
  slideCount: number;
  additionalNotes: string;
}

interface SlideSetupWizardProps {
  topic: string;
  content: string;
  instructions: string | null;
  onComplete: (config: WizardConfig) => void;
  onCancel: () => void;
}

// ============================================================
// Step definitions
// ============================================================

const STEP_ICONS = [
  FileTextIcon,
  BuildingIcon,
  UsersIcon,
  PaletteIcon,
  HashIcon,
  MessageSquareIcon,
];

const STEP_LABELS = [
  "テーマ",
  "産業",
  "対象者",
  "配色",
  "枚数",
  "追加の要望",
];

const INDUSTRY_OPTIONS = CATEGORIES.find((c) => c.key === "industry")!.options;

// Merge profession + ageGroup for audience step
const PROFESSION_OPTIONS = CATEGORIES.find(
  (c) => c.key === "profession",
)!.options;
const AGE_OPTIONS = CATEGORIES.find((c) => c.key === "ageGroup")!.options;
const AUDIENCE_OPTIONS = [...PROFESSION_OPTIONS, ...AGE_OPTIONS];

const COLOR_OPTIONS = CATEGORIES.find((c) => c.key === "colorStyle")!.options;

const COLOR_DOT_MAP: Record<string, string> = {
  ブルー: "bg-blue-500",
  グリーン: "bg-emerald-500",
  ピンク: "bg-pink-500",
  イエロー: "bg-yellow-400",
  パープル: "bg-purple-500",
  レッド: "bg-red-500",
  モノクロ: "bg-gray-500",
  ダーク: "bg-gray-800",
};

const SLIDE_COUNTS = [5, 8, 10, 15];

const TOTAL_STEPS = 6;

// ============================================================
// Component
// ============================================================

export function SlideSetupWizard({
  topic: initialTopic,
  content,
  instructions,
  onComplete,
  onCancel,
}: SlideSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1=forward, -1=back

  // Step states
  const [topicText, setTopicText] = useState(initialTopic);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedCount, setSelectedCount] = useState(8);
  const [additionalNotes, setAdditionalNotes] = useState(instructions ?? "");

  const topicInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLInputElement>(null);

  // Infer defaults from content
  const inferred = useMemo(
    () => inferStyleFromContent(initialTopic, content),
    [initialTopic, content],
  );

  // Apply inferred defaults on mount
  useEffect(() => {
    if (inferred.industry) {
      setSelectedIndustries([inferred.industry]);
    }
    if (inferred.colorStyle) {
      setSelectedColor(inferred.colorStyle);
    }
    if (inferred.profession) {
      setSelectedAudience((prev) =>
        prev.includes(inferred.profession!)
          ? prev
          : [...prev, inferred.profession!],
      );
    }
  }, [inferred]);

  // Focus input on relevant steps
  useEffect(() => {
    if (currentStep === 0) {
      topicInputRef.current?.focus();
      topicInputRef.current?.select();
    } else if (currentStep === 5) {
      notesInputRef.current?.focus();
    }
  }, [currentStep]);

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    } else {
      // Last step → complete
      onComplete({
        topic: topicText,
        industries: selectedIndustries,
        audience: selectedAudience,
        colorStyle: selectedColor,
        slideCount: selectedCount,
        additionalNotes,
      });
    }
  }, [
    currentStep,
    topicText,
    selectedIndustries,
    selectedAudience,
    selectedColor,
    selectedCount,
    additionalNotes,
    onComplete,
  ]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleGenerate = useCallback(() => {
    onComplete({
      topic: topicText,
      industries: selectedIndustries,
      audience: selectedAudience,
      colorStyle: selectedColor,
      slideCount: selectedCount,
      additionalNotes,
    });
  }, [
    topicText,
    selectedIndustries,
    selectedAudience,
    selectedColor,
    selectedCount,
    additionalNotes,
    onComplete,
  ]);

  // Keyboard handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, onCancel]);

  // Toggle helpers
  const toggleIndustry = (val: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  };

  const toggleAudience = (val: string) => {
    setSelectedAudience((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  };

  // Auto-suggest color when industry changes
  useEffect(() => {
    if (selectedIndustries.length > 0 && !selectedColor) {
      const suggested = INDUSTRY_COLOR_MAP[selectedIndustries[0]];
      if (suggested) setSelectedColor(suggested);
    }
  }, [selectedIndustries, selectedColor]);

  const StepIcon = STEP_ICONS[currentStep];

  // Slide animation variants
  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Theme
        return (
          <input
            ref={topicInputRef}
            type="text"
            value={topicText}
            onChange={(e) => setTopicText(e.target.value)}
            placeholder="テーマを入力..."
            className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
          />
        );

      case 1: // Industry (multi-select)
        return (
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRY_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => toggleIndustry(opt)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                  selectedIndustries.includes(opt)
                    ? "bg-primary/15 text-primary border-primary/30 font-medium"
                    : "bg-card text-foreground/80 border-border hover:border-primary/30 hover:text-foreground",
                )}
              >
                {opt}
                {selectedIndustries.includes(opt) && " ✓"}
              </button>
            ))}
          </div>
        );

      case 2: // Audience (multi-select)
        return (
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => toggleAudience(opt)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                  selectedAudience.includes(opt)
                    ? "bg-primary/15 text-primary border-primary/30 font-medium"
                    : "bg-card text-foreground/80 border-border hover:border-primary/30 hover:text-foreground",
                )}
              >
                {opt}
                {selectedAudience.includes(opt) && " ✓"}
              </button>
            ))}
          </div>
        );

      case 3: // Color (single select)
        return (
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  setSelectedColor(selectedColor === opt ? "" : opt)
                }
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                  selectedColor === opt
                    ? "bg-primary/15 text-primary border-primary/30 font-medium"
                    : "bg-card text-foreground/80 border-border hover:border-primary/30 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    COLOR_DOT_MAP[opt] ?? "bg-gray-400",
                  )}
                />
                {opt}
              </button>
            ))}
          </div>
        );

      case 4: // Slide count (single select)
        return (
          <div className="flex gap-2">
            {SLIDE_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setSelectedCount(n)}
                className={cn(
                  "w-12 h-10 text-sm font-medium rounded-lg border transition-colors",
                  selectedCount === n
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-card text-foreground/80 border-border hover:border-primary/30 hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        );

      case 5: // Additional notes
        return (
          <input
            ref={notesInputRef}
            type="text"
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="なければ空欄のまま次へ..."
            className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
          />
        );

      default:
        return null;
    }
  };

  const stepQuestions = [
    "テーマを確認してください",
    "産業を選んでください",
    "対象者を選んでください",
    "配色を選んでください",
    "枚数を選んでください",
    "追加の要望はありますか？",
  ];

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto w-full max-w-3xl px-4 pb-2"
    >
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
          <div className="flex items-center gap-2 text-sm">
            <StepIcon className="w-4 h-4 text-primary" />
            <span className="font-medium">{stepQuestions[currentStep]}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1}/{TOTAL_STEPS}
            </span>
            <button
              onClick={onCancel}
              className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Step content with slide animation */}
        <div className="px-4 py-3 min-h-[68px] relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/40">
          <button
            onClick={goBack}
            disabled={currentStep === 0}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors",
              currentStep === 0
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            ← 戻る
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              className="px-3 py-1.5 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              生成する
            </button>
            <button
              onClick={goNext}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              {currentStep === TOTAL_STEPS - 1 ? "完了" : "次へ →"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
