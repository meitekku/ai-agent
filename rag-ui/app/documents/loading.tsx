import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </div>
      </div>

      {/* KB card skeletons */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-border/50 px-5 py-4"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg mt-0.5" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-24 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
