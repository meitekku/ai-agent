import { ImageResponse } from "next/og";

// ─── Logo SVG (inlined to avoid filesystem dependency in Docker) ───

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="128 89 256 256" width="512" height="512"><rect x="128" y="89" width="256" height="256" rx="40" fill="#09090B"/><path d="M176 220 L256 160 L336 220 M256 160 L256 280" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/><circle cx="176" cy="220" r="24" fill="#fff"/><circle cx="336" cy="220" r="24" fill="#fff"/><circle cx="256" cy="280" r="24" fill="#fff"/><circle cx="256" cy="160" r="36" fill="#2563eb"/></svg>`;

const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

// ─── Font (subset of Noto Sans JP for Japanese OG text) ────────────

const OG_CHARS =
  "FleGrowthStella統合AIアシスタントチャットナレッジベースと連携した対話ドキュメント管理の構築能力をカスタマイズスケジューラ定時タスク自動実行ログインパスワード認証システムエラー設定が発生しました画像生成Web検索CRMスライドRAG・";

let fontCache: Promise<ArrayBuffer> | null = null;

function loadFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  fontCache = fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(OG_CHARS)}`
  )
    .then((r) => r.text())
    .then((css) => {
      const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
      if (!url)
        throw new Error("Could not extract font URL from Google Fonts");
      return fetch(url);
    })
    .then((r) => r.arrayBuffer());
  return fontCache;
}

// ─── Shared config & types ─────────────────────────────────────────

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export const ogPages = {
  root: {
    title: "統合 AI アシスタント",
    description: "RAG・CRM・スライド・画像生成・Web検索を統合",
  },
  chat: {
    title: "AI チャット",
    description: "ナレッジベースと連携した AI 対話",
    icon: "💬",
  },
  documents: {
    title: "ドキュメント管理",
    description: "ナレッジベースの構築と管理",
    icon: "📚",
  },
  skills: {
    title: "スキル管理",
    description: "AI の能力をカスタマイズ",
    icon: "⚡",
  },
  scheduler: {
    title: "スケジューラ",
    description: "定時タスクの自動実行",
    icon: "🕐",
  },
  gate: {
    title: "ログイン",
    description: "パスワード認証",
    icon: "🔒",
  },
  systemError: {
    title: "システムエラー",
    description: "設定エラーが発生しました",
    icon: "⚠️",
  },
} as const;

interface OgConfig {
  title: string;
  description?: string;
  icon?: string;
}

// ─── Image generator ───────────────────────────────────────────────

export async function createOgImage({ title, description, icon }: OgConfig) {
  const fontData = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(150deg, #09090B 0%, #0d1b2a 40%, #0a1628 70%, #09090B 100%)",
          fontFamily: '"Noto Sans JP", sans-serif',
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative orb — top right */}
        <div
          style={{
            position: "absolute",
            top: "-140px",
            right: "-60px",
            width: "480px",
            height: "480px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.04) 45%, transparent 70%)",
            display: "flex",
          }}
        />
        {/* Decorative orb — bottom left */}
        <div
          style={{
            position: "absolute",
            bottom: "-180px",
            left: "-80px",
            width: "520px",
            height: "520px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(27,150,255,0.09) 0%, rgba(27,150,255,0.02) 45%, transparent 65%)",
            display: "flex",
          }}
        />
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "4px",
            background:
              "linear-gradient(90deg, #2563eb 0%, #1B96FF 25%, transparent 55%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: "52px 64px 48px",
          }}
        >
          {/* Header — logo + brand */}
          <div
            style={{ display: "flex", alignItems: "center", gap: "18px" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_DATA_URI}
              width={52}
              height={52}
              style={{ borderRadius: "12px" }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "26px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.01em",
              }}
            >
              FleGrowth Stella
            </div>
          </div>

          {/* Body — icon + title + description */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {icon && (
              <div style={{ display: "flex", fontSize: "46px" }}>{icon}</div>
            )}
            <div
              style={{
                display: "flex",
                fontSize: "52px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              {title}
            </div>
            {description && (
              <div
                style={{
                  display: "flex",
                  fontSize: "21px",
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "0.01em",
                  marginTop: "4px",
                }}
              >
                {description}
              </div>
            )}
          </div>

          {/* Footer — accent bar + tagline */}
          <div
            style={{ display: "flex", alignItems: "center", gap: "14px" }}
          >
            <div
              style={{
                width: "40px",
                height: "3px",
                borderRadius: "2px",
                background: "linear-gradient(90deg, #2563eb, #1B96FF)",
                display: "flex",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "15px",
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "0.06em",
              }}
            >
              統合 AI アシスタント
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontData,
          style: "normal" as const,
          weight: 700 as const,
        },
      ],
    }
  );
}
