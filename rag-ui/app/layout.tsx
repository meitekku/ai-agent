import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FleGrowth Stella",
    template: "%s | FleGrowth Stella",
  },
  description:
    "RAG ナレッジベース検索、CRM 商機分析、提案書スライド自動生成、画像認識・生成、ウェブ検索、Generative UI を統合した AI アシスタント。",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "FleGrowth Stella — 統合 AI アシスタント",
    description:
      "RAG ナレッジベース、CRM 分析、提案書生成、画像生成、Generative UI を一つに統合した AI プラットフォーム",
    type: "website",
    locale: "ja_JP",
    siteName: "FleGrowth Stella",
  },
  twitter: {
    card: "summary_large_image",
    title: "FleGrowth Stella — 統合 AI アシスタント",
    description:
      "RAG ナレッジベース、CRM 分析、提案書生成、画像生成、Generative UI を一つに統合した AI プラットフォーム",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FleGrowth Stella",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialSidebarOpen = cookieStore.get("sidebar-open")?.value === "true";

  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider>
              <AppShell initialSidebarOpen={initialSidebarOpen}>
                {children}
              </AppShell>
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
