import { Skeleton } from "@/components/ui/skeleton";

export default function SkillsLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-36 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
          {/* Tabs placeholder */}
          <Skeleton className="mt-4 h-9 w-52 rounded-md" />
        </div>
      </div>

      {/* Skill list */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-2 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-32 flex-1 max-w-32" />
                  <Skeleton className="h-5 w-9 rounded-full ml-auto" />
                </div>
                <div className="mt-1.5 pl-5 space-y-1">
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
