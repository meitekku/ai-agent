import { ImageResponse } from "next/og";

// ─── Logo SVG (inlined to avoid filesystem dependency in Docker) ───

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="128 89 256 256" width="512" height="512"><rect x="128" y="89" width="256" height="256" rx="40" fill="#09090B"/><path d="M176 220 L256 160 L336 220 M256 160 L256 280" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/><circle cx="176" cy="220" r="24" fill="#fff"/><circle cx="336" cy="220" r="24" fill="#fff"/><circle cx="256" cy="280" r="24" fill="#fff"/><circle cx="256" cy="160" r="36" fill="#2563eb"/></svg>`;

const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

// ─── Font ──────────────────────────────────────────────────────────

// All Japanese characters used across OG images (descriptions + tags)
const OG_CHARS = [
  "FleGrowthStella統合AIアシスタント",
  "RAG検索CRM分析スライド生成画像WebコーPDFOCRKBZIPCron",
  "チャットナレッジベースと連携した対話ツールを自動選択して回答",
  "ドキュメント管理やテキストをアップロードすると知識グラフ構築から活用できます",
  "スキルの追加カスタムプロンプトで専門性をカスタマイズ",
  "スケジューラ定時タスクエージェント実行結果メール通知",
  "ログインパスワード認証アクセス保護",
  "システムエラー環境変数設定確認してください",
  "マルチモダブランチ会話ファイル添付ベクトルインポートレジストリ",
  "レポート・プラットフォーム",
].join("");

let fontBoldCache: Promise<ArrayBuffer> | null = null;
let fontRegularCache: Promise<ArrayBuffer> | null = null;

function loadFontWeight(weight: number): Promise<ArrayBuffer> {
  const cache = weight === 700 ? fontBoldCache : fontRegularCache;
  if (cache) return cache;
  const promise = fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(OG_CHARS)}`
  )
    .then((r) => r.text())
    .then((css) => {
      const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
      if (!url) throw new Error("Could not extract font URL");
      return fetch(url);
    })
    .then((r) => r.arrayBuffer());
  if (weight === 700) fontBoldCache = promise;
  else fontRegularCache = promise;
  return promise;
}

// ─── Shared config & types ─────────────────────────────────────────

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export const ogPages = {
  root: {
    title: "統合 AI アシスタント",
    description:
      "RAG 検索・CRM 分析・スライド生成・画像生成・Web 検索・コード実行を統合した AI プラットフォーム",
    tags: ["RAG検索", "CRM分析", "スライド生成", "画像生成", "Web検索", "定時タスク"],
  },
  chat: {
    title: "AI チャット",
    description:
      "ナレッジベースと連携した AI 対話。RAG 検索・Web 検索・画像生成など、ツールを AI が自動選択して回答",
    icon: "💬",
    tags: ["マルチモーダル", "ツール自動選択", "ブランチ会話", "ファイル添付"],
  },
  documents: {
    title: "ドキュメント管理",
    description:
      "PDF やテキストをアップロードすると AI が知識グラフを自動構築。チャットから検索・活用できます",
    icon: "📚",
    tags: ["PDF OCR", "知識グラフ", "マルチKB", "ベクトル検索"],
  },
  skills: {
    title: "スキル管理",
    description:
      "AI アシスタントのスキルを追加・管理。カスタムプロンプトで AI の専門性をカスタマイズ",
    icon: "⚡",
    tags: ["カスタムスキル", "プロンプト管理", "ZIP インポート", "レジストリ"],
  },
  scheduler: {
    title: "スケジューラ",
    description:
      "Cron スケジュールで AI エージェントを自動実行。KB 検索・Web 検索の結果をメール通知",
    icon: "🕐",
    tags: ["Cron 定時実行", "自動レポート", "メール通知", "ツール連携"],
  },
  gate: {
    title: "ログイン",
    description: "パスワード認証でアクセスを保護",
    icon: "🔒",
    tags: ["パスワード認証"],
  },
  systemError: {
    title: "システムエラー",
    description: "システム設定にエラーがあります。環境変数を確認してください",
    icon: "⚠️",
    tags: [] as string[],
  },
} as const;

interface OgConfig {
  title: string;
  description?: string;
  icon?: string;
  tags?: readonly string[];
}

// ─── Image generator ───────────────────────────────────────────────

export async function createOgImage({
  title,
  description,
  icon,
  tags,
}: OgConfig) {
  const [fontBold, fontRegular] = await Promise.all([
    loadFontWeight(700),
    loadFontWeight(400),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fafbfc",
          fontFamily: '"Noto Sans JP", sans-serif',
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "5px",
            background: "linear-gradient(90deg, #0176D3, #1B96FF, #0176D3)",
            display: "flex",
          }}
        />
        {/* Left accent bar */}
        <div
          style={{
            position: "absolute",
            top: "5px",
            left: "0",
            width: "6px",
            height: "100%",
            background: "linear-gradient(180deg, #0176D3 0%, #1B96FF 60%, transparent 100%)",
            display: "flex",
          }}
        />
        {/* Decorative circle — top right */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "320px",
            height: "320px",
            borderRadius: "50%",
            border: "1px solid rgba(1,118,211,0.08)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-40px",
            right: "-40px",
            width: "240px",
            height: "240px",
            borderRadius: "50%",
            border: "1px solid rgba(1,118,211,0.06)",
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
            padding: "44px 60px 40px 52px",
          }}
        >
          {/* Header — logo + brand + subtitle */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_DATA_URI}
              width={46}
              height={46}
              style={{ borderRadius: "11px" }}
            />
            <div
              style={{
                display: "flex",
                fontSize: "24px",
                fontWeight: 700,
                color: "#0f172a",
                letterSpacing: "-0.01em",
              }}
            >
              FleGrowth Stella
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "14px",
                color: "#94a3b8",
                marginLeft: "4px",
                letterSpacing: "0.02em",
              }}
            >
              統合 AI アシスタント
            </div>
          </div>

          {/* Body — icon + title + description */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {icon && (
                <div style={{ display: "flex", fontSize: "40px" }}>{icon}</div>
              )}
              <div
                style={{
                  display: "flex",
                  fontSize: "46px",
                  fontWeight: 700,
                  color: "#0f172a",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                {title}
              </div>
            </div>
            {description && (
              <div
                style={{
                  display: "flex",
                  fontSize: "20px",
                  fontWeight: 400,
                  color: "#64748b",
                  lineHeight: 1.6,
                  maxWidth: "920px",
                }}
              >
                {description}
              </div>
            )}
          </div>

          {/* Footer — tags */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(tags ?? []).map((tag, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    padding: "5px 16px",
                    borderRadius: "20px",
                    background: "#EEF4FF",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#0176D3",
                  }}
                >
                  {tag}
                </div>
              ))}
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
          data: fontBold,
          style: "normal" as const,
          weight: 700 as const,
        },
        {
          name: "Noto Sans JP",
          data: fontRegular,
          style: "normal" as const,
          weight: 400 as const,
        },
      ],
    }
  );
}
