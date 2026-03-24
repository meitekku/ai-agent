import { Skeleton } from "@/components/ui/skeleton";

export function ChatInputSkeleton() {
  return (
    <div className="sticky bottom-0 z-30 mt-auto">
      <div className="pointer-events-none h-8 bg-gradient-to-t from-background to-transparent" />
      <div className="bg-background">
        <div className="mx-auto max-w-3xl px-4">
          {/* PromptInput frame (textarea 64px + footer tools ~49px) */}
          <Skeleton className="h-[113px] w-full rounded-xl" />
          {/* Disclaimer */}
          <Skeleton className="mx-auto mt-1.5 mb-1.5 h-3 w-72" />
        </div>
      </div>
    </div>
  );
}
