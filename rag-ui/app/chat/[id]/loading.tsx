import { Skeleton } from "@/components/ui/skeleton";
import { ChatInputSkeleton } from "@/components/chat-input-skeleton";

export default function ChatLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden px-4">
        <div className="mx-auto max-w-3xl space-y-6 py-8">
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-64 rounded-2xl" />
          </div>
          {/* Assistant message */}
          <div className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="space-y-2 flex-1 max-w-lg">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-48 rounded-2xl" />
          </div>
          {/* Assistant message */}
          <div className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="space-y-2 flex-1 max-w-md">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </div>
      </div>

      <ChatInputSkeleton />
    </div>
  );
}
