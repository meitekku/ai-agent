import { NextResponse, userAgent } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, generateToken } from "./lib/auth-token";

const AUTH_COOKIE_NAME = "pw";
const REDIRECT_URL_COOKIE = "redirect_url";

const PW = process.env.PW;

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

  // Allow bots (Slackbot, Twitterbot etc.) for OG link previews.
  // Exclude /chat/[id] which contains conversation history.
  const { isBot } = userAgent(request);
  if (isBot && !/^\/chat\/[^/]+$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

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
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|ico|svg|js|css|woff|woff2)$).*)",
  ],
};
