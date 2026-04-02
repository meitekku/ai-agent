import { NextResponse, userAgent } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, generateToken } from "./lib/auth-token";

const AUTH_COOKIE_NAME = "pw";
const REDIRECT_URL_COOKIE = "redirect_url";

const PW = process.env.PW;

// ─── OG metadata for bot responses (no real page content exposed) ──

const OG_SITE = "FleGrowth Stella";
const OG_DESC =
  "RAG ナレッジベース、CRM 分析、提案書生成、画像生成、Generative UI を一つに統合した AI プラットフォーム";

const OG_PAGES: Record<string, { title: string; alt: string }> = {
  "/": { title: "統合 AI アシスタント", alt: "FleGrowth Stella — 統合 AI アシスタント" },
  "/new": { title: "AI チャット", alt: "AI チャット — FleGrowth Stella" },
  "/documents": { title: "ドキュメント管理", alt: "ドキュメント管理 — FleGrowth Stella" },
  "/skills": { title: "スキル管理", alt: "スキル管理 — FleGrowth Stella" },
  "/scheduler": { title: "スケジューラ", alt: "スケジューラ — FleGrowth Stella" },
  "/gate": { title: "ログイン", alt: "ログイン — FleGrowth Stella" },
  "/system-error": { title: "システムエラー", alt: "システムエラー — FleGrowth Stella" },
};

function getOgPage(pathname: string) {
  if (OG_PAGES[pathname]) return OG_PAGES[pathname];
  if (pathname.startsWith("/chat/")) return OG_PAGES["/new"];
  if (pathname.startsWith("/documents/")) return OG_PAGES["/documents"];
  if (pathname.startsWith("/scheduler/")) return OG_PAGES["/scheduler"];
  if (pathname.startsWith("/graph/")) return OG_PAGES["/documents"];
  return OG_PAGES["/"];
}

function buildBotHtml(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const page = getOgPage(pathname);
  const base = process.env.APP_URL || request.nextUrl.origin;
  const ogImage = `${base}${pathname === "/" ? "" : pathname}/opengraph-image`;
  const title = `${page.title} | ${OG_SITE}`;

  return new Response(
    `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>${title}</title>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${OG_DESC}"/>
<meta property="og:site_name" content="${OG_SITE}"/>
<meta property="og:type" content="website"/>
<meta property="og:locale" content="ja_JP"/>
<meta property="og:image" content="${ogImage}"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="${page.alt}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${OG_DESC}"/>
<meta name="twitter:image" content="${ogImage}"/>
</head><body></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function setTokenCookie(response: NextResponse) {
  const token = generateToken(PW!);
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function proxy(request: NextRequest) {
  // No PW configured → redirect to config error page
  if (!PW) {
    const { pathname } = request.nextUrl;
    if (pathname === "/system-error") return NextResponse.next();
    return NextResponse.redirect(new URL("/system-error", request.url));
  }

  // SNS bots → minimal HTML with OG meta tags only, no real page content.
  // UA spoofable, but buildBotHtml only exposes public metadata.
  const { isBot } = userAgent(request);
  if (isBot) return buildBotHtml(request);

  const url = request.nextUrl.clone();
  const { pathname } = url;

  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isVerified = authCookie ? verifyToken(authCookie, PW) : false;

  const authFromParam = url.searchParams.get(AUTH_COOKIE_NAME);

  if (isVerified) {
    if (pathname !== "/gate") {
      if (authFromParam) {
        url.searchParams.delete(AUTH_COOKIE_NAME);
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    } else {
      const savedRedirectUrl = request.cookies.get(REDIRECT_URL_COOKIE)?.value;
      const homeUrl = new URL(savedRedirectUrl || "/", request.url);
      const response = NextResponse.redirect(homeUrl);
      if (savedRedirectUrl) response.cookies.delete(REDIRECT_URL_COOKIE);
      return response;
    }
  } else {
    if (pathname !== "/gate") {
      if (authFromParam === PW) {
        // Valid password in URL param → set token cookie + redirect to clean URL
        url.searchParams.delete(AUTH_COOKIE_NAME);
        const response = NextResponse.redirect(url);
        setTokenCookie(response);
        return response;
      } else {
        const redirectUrl = new URL("/gate", request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.cookies.set(REDIRECT_URL_COOKIE, request.url, {
          sameSite: "lax",
          maxAge: 60 * 60,
        });
        return response;
      }
    } else {
      if (authFromParam === PW) {
        const savedRedirectUrl =
          request.cookies.get(REDIRECT_URL_COOKIE)?.value;
        const redirectUrl = new URL(savedRedirectUrl || "/", request.url);
        const response = NextResponse.redirect(redirectUrl);
        setTokenCookie(response);
        if (savedRedirectUrl) response.cookies.delete(REDIRECT_URL_COOKIE);
        return response;
      } else {
        if (authFromParam) url.searchParams.delete(AUTH_COOKIE_NAME);
        return NextResponse.next();
      }
    }
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*(?:opengraph-image|twitter-image)|.*\\.(?:png|jpg|jpeg|gif|ico|svg|js|css|woff|woff2)$).*)",
  ],
};
