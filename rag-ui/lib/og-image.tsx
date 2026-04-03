import { ImageResponse } from "next/og";

// ─── Logo SVG (inlined to avoid filesystem dependency in Docker) ───

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="128 89 256 256" width="512" height="512"><rect x="128" y="89" width="256" height="256" rx="40" fill="#09090B"/><path d="M176 220 L256 160 L336 220 M256 160 L256 280" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/><circle cx="176" cy="220" r="24" fill="#fff"/><circle cx="336" cy="220" r="24" fill="#fff"/><circle cx="256" cy="280" r="24" fill="#fff"/><circle cx="256" cy="160" r="36" fill="#2563eb"/></svg>`;

const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

// ─── Font ──────────────────────────────────────────────────────────

const OG_CHARS = [
  "FleGrowthStella",
  "統合AIアシスタントチャットドキュメント管理スキルスケジューラログインシステムエラー",
].join("");

let fontBoldCache: Promise<ArrayBuffer> | null = null;

function loadFont(): Promise<ArrayBuffer> {
  if (fontBoldCache) return fontBoldCache;
  fontBoldCache = fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(OG_CHARS)}`
  )
    .then((r) => r.text())
    .then((css) => {
      const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
      if (!url) throw new Error("Could not extract font URL");
      return fetch(url);
    })
    .then((r) => r.arrayBuffer());
  return fontBoldCache;
}

// ─── Shared config & types ─────────────────────────────────────────

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// Accent colors per page for the glow orb
const pageAccents: Record<string, { from: string; to: string }> = {
  root: { from: "#2563eb", to: "#06b6d4" },
  chat: { from: "#2563eb", to: "#7c3aed" },
  documents: { from: "#0891b2", to: "#2563eb" },
  skills: { from: "#7c3aed", to: "#ec4899" },
  scheduler: { from: "#0d9488", to: "#2563eb" },
  gate: { from: "#475569", to: "#2563eb" },
  systemError: { from: "#dc2626", to: "#f97316" },
};

export const ogPages = {
  root: {
    title: "統合 AI アシスタント",
    accent: "root",
  },
  chat: {
    title: "AI チャット",
    accent: "chat",
  },
  documents: {
    title: "ドキュメント管理",
    accent: "documents",
  },
  skills: {
    title: "スキル管理",
    accent: "skills",
  },
  scheduler: {
    title: "スケジューラ",
    accent: "scheduler",
  },
  gate: {
    title: "ログイン",
    accent: "gate",
  },
  systemError: {
    title: "システムエラー",
    accent: "systemError",
  },
} as const;

interface OgConfig {
  title: string;
  accent?: string;
}

// ─── Image generator ───────────────────────────────────────────────

export async function createOgImage({ title, accent = "root" }: OgConfig) {
  const fontBold = await loadFont();
  const colors = pageAccents[accent] ?? pageAccents.root;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0a0a0f",
          fontFamily: '"Noto Sans JP", sans-serif',
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ── Background gradient mesh ── */}
        <div
          style={{
            position: "absolute",
            top: "-200px",
            right: "-100px",
            width: "700px",
            height: "700px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.from}18 0%, transparent 70%)`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-300px",
            left: "-100px",
            width: "800px",
            height: "800px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.to}12 0%, transparent 70%)`,
            display: "flex",
          }}
        />

        {/* ── Accent orb — focal glow ── */}
        <div
          style={{
            position: "absolute",
            top: "160px",
            right: "120px",
            width: "280px",
            height: "280px",
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${colors.from}40, ${colors.to}30)`,
            filter: "blur(60px)",
            display: "flex",
          }}
        />

        {/* ── Grid dots pattern ── */}
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* ── Bottom gradient line ── */}
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            width: "100%",
            height: "3px",
            background: `linear-gradient(90deg, transparent, ${colors.from}, ${colors.to}, transparent)`,
            display: "flex",
          }}
        />

        {/* ── Content ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            width: "100%",
            padding: "64px 72px",
            position: "relative",
          }}
        >
          {/* Top — logo + brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_DATA_URI}
              width={56}
              height={56}
              style={{ borderRadius: "14px" }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "30px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.02em",
              }}
            >
              FleGrowth Stella
            </div>
          </div>

          {/* Center — page title */}
          <div
            style={{
              display: "flex",
              fontSize: "72px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>

          {/* Bottom — subtle accent bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "48px",
                height: "4px",
                borderRadius: "2px",
                background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                display: "flex",
              }}
            />
            <div
              style={{
                width: "12px",
                height: "4px",
                borderRadius: "2px",
                background: colors.from,
                opacity: 0.4,
                display: "flex",
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontBold,
          style: "normal" as const,
          weight: 700 as const,
        },
      ],
    }
  );
}
