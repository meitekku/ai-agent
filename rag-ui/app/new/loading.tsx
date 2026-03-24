import { Skeleton } from "@/components/ui/skeleton";
import { ChatInputSkeleton } from "@/components/chat-input-skeleton";

export default function NewChatLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Empty state: icon + title + description + suggestion cards */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 pb-32">
        {/* Icon */}
        <Skeleton className="size-14 rounded-2xl" />
        {/* Title + description */}
        <div className="space-y-2 flex flex-col items-center">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        {/* Suggestion cards grid */}
        <div className="mt-2 grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>

      <ChatInputSkeleton />
    </div>
  );
}
