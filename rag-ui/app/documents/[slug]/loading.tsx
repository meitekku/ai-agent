import { Skeleton } from "@/components/ui/skeleton";

export default function KBDetailLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-36" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Skeleton className="h-3.5 w-24 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3"
              >
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
