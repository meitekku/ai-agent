import { AlertTriangle } from "lucide-react";

export default function SystemErrorPage() {
  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-[10%] -left-[5%] h-[500px] w-[600px] rounded-full opacity-[0.05] blur-[140px]"
          style={{ background: "oklch(0.65 0.15 25)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative flex w-full max-w-[400px] flex-col gap-8 px-6 md:-translate-x-[8vw]">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <AlertTriangle className="h-6 w-6 text-red-400/80" strokeWidth={1.5} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-[1.75rem] font-semibold leading-none tracking-tighter text-zinc-100">
            システムエラー
          </h1>
          <p className="text-sm leading-relaxed text-zinc-500">
            サービスを利用できません。
            <br />
            サーバー管理者に連絡してください。
          </p>
        </div>
      </div>
    </div>
  );
}
