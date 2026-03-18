"use client";

import { useState } from "react";
import { motion, type Variants } from "motion/react";

/* ─── SVG 座標定数 ─── */
const VIEW = "128 89 256 256";
const CORE = { cx: 256, cy: 160, r: 36 }; // AI 中心ノード（緑）
const NODES = [
  { cx: 176, cy: 220, r: 24 }, // 左
  { cx: 336, cy: 220, r: 24 }, // 右
  { cx: 256, cy: 280, r: 24 }, // 下
];
const LINE_D = "M176 220 L256 160 L336 220 M256 160 L256 280";

// 各セグメント長（概算: 対角≈100, 垂直=120）
const TOTAL_LENGTH = 420;

/* ================================================================
   1. Draw-On — 線描画 → ノードポップイン → コア登場
   ================================================================ */
function DrawOnLogo({ replay }: { replay: number }) {
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
  };
  const lineDraw: Variants = {
    hidden: { strokeDashoffset: TOTAL_LENGTH, opacity: 0.35 },
    visible: {
      strokeDashoffset: 0,
      opacity: 0.35,
      transition: { duration: 1.2, ease: "easeInOut" },
    },
  };
  const nodeIn: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring", stiffness: 260, damping: 20 },
    },
  };
  const coreIn: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring", stiffness: 200, damping: 14, delay: 0.6 },
    },
  };

  return (
    <motion.svg
      key={replay}
      viewBox={VIEW}
      fill="none"
      className="size-full"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* 連接線 */}
      <motion.path
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={TOTAL_LENGTH}
        variants={lineDraw}
      />
      {/* 知識ノード */}
      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          fill="currentColor"
          variants={nodeIn}
        />
      ))}
      {/* AI コア */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r}
        className="fill-primary"
        variants={coreIn}
      />
    </motion.svg>
  );
}

/* ================================================================
   2. Pulse — コアノードが常時呼吸 + 接続線が微明滅
   ================================================================ */
function PulseLogo() {
  return (
    <svg viewBox={VIEW} fill="none" className="size-full">
      {/* 連接線 */}
      <path
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.35}
      />
      {/* 知識ノード */}
      {NODES.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="currentColor" />
      ))}
      {/* AI コア — グロー */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r + 8}
        className="fill-primary"
        animate={{ opacity: [0, 0.25, 0], scale: [0.9, 1.15, 0.9] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* AI コア — 本体 */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r}
        className="fill-primary"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

/* ================================================================
   3. Hover — ホバー反応（全体スケール + コア輝度変化）
   ================================================================ */
function HoverLogo() {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.svg
      viewBox={VIEW}
      fill="none"
      className="size-full cursor-pointer"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* 連接線 */}
      <motion.path
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ opacity: hovered ? 0.7 : 0.35 }}
        transition={{ duration: 0.3 }}
      />
      {/* 知識ノード */}
      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          fill="currentColor"
          animate={{ scale: hovered ? 1.15 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: i * 0.05 }}
        />
      ))}
      {/* AI コア — グロー */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r + 12}
        className="fill-primary"
        animate={{ opacity: hovered ? 0.3 : 0 }}
        transition={{ duration: 0.3 }}
      />
      {/* AI コア */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r}
        className="fill-primary"
        animate={{ scale: hovered ? 1.12 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      />
    </motion.svg>
  );
}

/* ================================================================
   4. Data Flow — 接続線上を光の粒子が流れる
   ================================================================ */
function DataFlowLogo() {
  // 各セグメントのパス + 粒子
  const segments = [
    { d: "M256 160 L176 220", dur: 1.8, delay: 0 },
    { d: "M256 160 L336 220", dur: 1.8, delay: 0.6 },
    { d: "M256 160 L256 280", dur: 2.0, delay: 1.2 },
  ];

  return (
    <svg viewBox={VIEW} fill="none" className="size-full">
      <defs>
        <radialGradient id="particle-glow">
          <stop offset="0%" className="[stop-color:var(--color-primary)]" stopOpacity={1} />
          <stop offset="100%" className="[stop-color:var(--color-primary)]" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* 連接線 */}
      <path
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.2}
      />

      {/* 流動パーティクル */}
      {segments.map((seg, i) => (
        <g key={i}>
          {/* 明るいトレイル */}
          <motion.path
            d={seg.d}
            stroke="url(#particle-glow)"
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            strokeDasharray="30 400"
            animate={{ strokeDashoffset: [200, -200] }}
            transition={{
              duration: seg.dur,
              repeat: Infinity,
              ease: "linear",
              delay: seg.delay,
            }}
          />
          {/* 粒子本体 */}
          <circle r={5} fill="url(#particle-glow)">
            <animateMotion
              dur={`${seg.dur}s`}
              repeatCount="indefinite"
              begin={`${seg.delay}s`}
              path={seg.d}
            />
          </circle>
        </g>
      ))}

      {/* 知識ノード */}
      {NODES.map((n, i) => (
        <g key={i}>
          <motion.circle
            cx={n.cx}
            cy={n.cy}
            r={n.r + 4}
            className="fill-primary"
            animate={{ opacity: [0, 0.2, 0] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: segments[i].delay + segments[i].dur * 0.8,
            }}
          />
          <circle cx={n.cx} cy={n.cy} r={n.r} fill="currentColor" />
        </g>
      ))}

      {/* AI コア — 常時パルス */}
      <motion.circle
        cx={CORE.cx}
        cy={CORE.cy}
        r={CORE.r + 6}
        className="fill-primary"
        animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx={CORE.cx} cy={CORE.cy} r={CORE.r} className="fill-primary" />
    </svg>
  );
}

/* ================================================================
   5. Combo — Draw-On 初回 → Pulse 常駐
   ================================================================ */
function ComboLogo({ replay }: { replay: number }) {
  const [drawn, setDrawn] = useState(false);

  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  };
  const lineDraw: Variants = {
    hidden: { strokeDashoffset: TOTAL_LENGTH, opacity: 0.35 },
    visible: {
      strokeDashoffset: 0,
      opacity: 0.35,
      transition: { duration: 1.0, ease: "easeInOut" },
    },
  };
  const nodeIn: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring", stiffness: 260, damping: 20 },
    },
  };

  return (
    <motion.svg
      key={replay}
      viewBox={VIEW}
      fill="none"
      className="size-full"
      variants={container}
      initial="hidden"
      animate="visible"
      onAnimationComplete={() => setDrawn(true)}
    >
      <motion.path
        d={LINE_D}
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={TOTAL_LENGTH}
        variants={lineDraw}
      />
      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          fill="currentColor"
          variants={nodeIn}
        />
      ))}
      {/* コア: draw 完了後 pulse へ遷移 */}
      {drawn ? (
        <>
          <motion.circle
            cx={CORE.cx}
            cy={CORE.cy}
            r={CORE.r + 8}
            className="fill-primary"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 0.25, 0], scale: [0.9, 1.15, 0.9] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx={CORE.cx}
            cy={CORE.cy}
            r={CORE.r}
            className="fill-primary"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      ) : (
        <motion.circle
          cx={CORE.cx}
          cy={CORE.cy}
          r={CORE.r}
          className="fill-primary"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.5 }}
        />
      )}
    </motion.svg>
  );
}

/* ================================================================
   Page
   ================================================================ */
const DEMOS = [
  { id: "draw", label: "Draw-On", desc: "線描画 → ノードポップイン" },
  { id: "pulse", label: "Pulse", desc: "コアノード常時呼吸" },
  { id: "hover", label: "Hover", desc: "ホバーで反応" },
  { id: "flow", label: "Data Flow", desc: "パーティクルが流れる" },
  { id: "combo", label: "Combo", desc: "Draw-On → Pulse 常駐" },
] as const;

export default function TestLogoPage() {
  const [replay, setReplay] = useState(0);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Logo Animation Test</h1>
        <p className="text-sm text-muted-foreground">
          motion/react SVG アニメーション比較
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Replay button */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setReplay((n) => n + 1)}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Replay All
          </button>
        </div>

        {/* Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((demo) => (
            <div
              key={demo.id}
              className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6"
            >
              <p className="text-sm font-medium">{demo.label}</p>
              <p className="text-xs text-muted-foreground">{demo.desc}</p>

              {/* Logo area — 大きめに表示 */}
              <div className="flex size-40 items-center justify-center text-foreground">
                {demo.id === "draw" && <DrawOnLogo replay={replay} />}
                {demo.id === "pulse" && <PulseLogo />}
                {demo.id === "hover" && <HoverLogo />}
                {demo.id === "flow" && <DataFlowLogo />}
                {demo.id === "combo" && <ComboLogo replay={replay} />}
              </div>

              {/* 小さいサイズ (sidebar 相当: 16px) */}
              <div className="mt-2 flex items-center gap-3">
                <div className="flex size-4 items-center justify-center text-foreground">
                  {demo.id === "draw" && <DrawOnLogo replay={replay} />}
                  {demo.id === "pulse" && <PulseLogo />}
                  {demo.id === "hover" && <HoverLogo />}
                  {demo.id === "flow" && <DataFlowLogo />}
                  {demo.id === "combo" && <ComboLogo replay={replay} />}
                </div>
                <span className="text-xs text-muted-foreground">16px (sidebar)</span>

                <div className="flex size-8 items-center justify-center text-foreground">
                  {demo.id === "draw" && <DrawOnLogo replay={replay} />}
                  {demo.id === "pulse" && <PulseLogo />}
                  {demo.id === "hover" && <HoverLogo />}
                  {demo.id === "flow" && <DataFlowLogo />}
                  {demo.id === "combo" && <ComboLogo replay={replay} />}
                </div>
                <span className="text-xs text-muted-foreground">32px</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
