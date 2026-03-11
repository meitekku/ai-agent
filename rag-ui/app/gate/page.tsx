"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { verifyPw } from "./action";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password || isLoading) return;

    setIsLoading(true);
    try {
      const result = await verifyPw(password);
      if (result.success) {
        // Cookie is set server-side by the action — just navigate
        router.push("/");
        router.refresh();
      } else if (result.rateLimited) {
        setRateLimited(true);
        setCooldown(result.remainingSeconds ?? 0);
        setIsLoading(false);
      } else {
        setError(true);
        setIsLoading(false);
      }
    } catch {
      setError(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-[10%] -left-[5%] h-[600px] w-[700px] rounded-full opacity-[0.07] blur-[140px]"
          style={{ background: "oklch(0.72 0.12 165)" }}
        />
        <div
          className="absolute -right-[8%] bottom-[10%] h-[400px] w-[500px] rounded-full opacity-[0.04] blur-[120px]"
          style={{ background: "oklch(0.60 0.08 200)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative flex w-full max-w-[360px] flex-col items-center gap-10 px-6">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <Lock className="h-6 w-6 text-zinc-400" strokeWidth={1.5} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[1.75rem] font-semibold leading-none tracking-tighter text-zinc-100">
            認証が必要です
          </h1>
          <p className="text-sm leading-relaxed text-zinc-500">
            パスワードを入力してアクセスしてください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
                setRateLimited(false);
              }}
              disabled={isLoading || rateLimited}
              className={`w-full rounded-xl border bg-white/3 py-3 pr-12 pl-4 text-[15px] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl placeholder:text-zinc-600 focus:outline-none ${
                error || rateLimited
                  ? "border-red-500/60"
                  : "border-white/6 focus:border-white/12"
              } ${isLoading || rateLimited ? "opacity-50" : ""}`}
              style={{ transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
              placeholder="パスワード"
            />
            <button
              type="submit"
              disabled={isLoading || rateLimited || !password}
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-all duration-200 hover:bg-white/6 hover:text-zinc-200 active:scale-[0.92] disabled:pointer-events-none disabled:opacity-30"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>

          <div
            className={`overflow-hidden ${
              error || rateLimited
                ? "mt-3 max-h-12 opacity-100"
                : "max-h-0 opacity-0"
            }`}
            style={{ transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <p className="text-[13px] text-red-400/80">
              {rateLimited
                ? `試行回数が上限に達しました。${cooldown}秒後に再試行してください`
                : "パスワードが正しくありません"}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
