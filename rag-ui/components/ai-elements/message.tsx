"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { WidgetRenderer } from "@/components/widget-renderer";
import {
  parseAllShowWidgets,
  extractPartialWidget,
  computePartialWidgetKey,
} from "@/lib/widget-parser";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Streamdown, type PluginConfig } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div
    className={cn(
      "flex items-center gap-1 group-[.is-user]:ml-auto",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null,
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch",
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange],
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children],
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden",
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className,
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const math = createMathPlugin({ singleDollarTextMath: true });
const streamdownPlugins = { cjk, code, math, mermaid } as PluginConfig;

const sdClassName =
  "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:pl-5 [&_ol]:pl-5";

/**
 * Renders markdown with inline widget support.
 * Widget parsing happens OUTSIDE streamdown (CodePilot pattern) so that
 * isStreaming is derived from fence-close detection, not streamdown internals.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    const content =
      typeof props.children === "string" ? props.children : "";
    const hasWidgetFence = content.includes("```show-widget");

    // ── Fast path: no widgets — render with Streamdown directly ──────
    if (!hasWidgetFence) {
      return (
        <Streamdown
          className={cn(sdClassName, className)}
          plugins={streamdownPlugins}
          {...props}
        />
      );
    }

    // ── Check if last fence is still being streamed ──────────────────
    const lastFenceStart = content.lastIndexOf("```show-widget");
    const afterLastFence = content.slice(lastFenceStart);
    const lastFenceClosed = /```show-widget\s*\n?[\s\S]*?\n?\s*```/.test(
      afterLastFence,
    );

    // All fences complete
    if (lastFenceClosed) {
      const segments = parseAllShowWidgets(content);
      return (
        <div className={cn(sdClassName, className)}>
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <Streamdown key={`t-${i}`} plugins={streamdownPlugins}>
                {seg.content}
              </Streamdown>
            ) : (
              <WidgetRenderer
                key={`w-${i}`}
                widgetCode={seg.widgetCode}
                isStreaming={false}
                title={seg.title}
              />
            ),
          )}
        </div>
      );
    }

    // ── Last fence still streaming ───────────────────────────────────
    const beforePart = content.slice(0, lastFenceStart).trim();
    const hasCompleted = beforePart && /```show-widget/.test(beforePart);
    const completedSegments = hasCompleted
      ? parseAllShowWidgets(beforePart)
      : [];

    // Extract partial widget from the open fence
    const fenceBody = content
      .slice(lastFenceStart + "```show-widget".length)
      .trim();
    const partial = extractPartialWidget(fenceBody);
    const partialKey = computePartialWidgetKey(content);

    return (
      <div className={cn(sdClassName, className)}>
        {/* Text before first widget (no completed fences) */}
        {!hasCompleted && beforePart && (
          <Streamdown key="pre-text" plugins={streamdownPlugins}>
            {beforePart}
          </Streamdown>
        )}
        {/* Completed fences + interleaved text */}
        {completedSegments.map((seg, i) =>
          seg.type === "text" ? (
            <Streamdown key={`t-${i}`} plugins={streamdownPlugins}>
              {seg.content}
            </Streamdown>
          ) : (
            <WidgetRenderer
              key={`w-${i}`}
              widgetCode={seg.widgetCode}
              isStreaming={false}
              title={seg.title}
            />
          ),
        )}
        {/* Streaming partial widget */}
        {partial.widgetCode && partial.widgetCode.length > 10 ? (
          <WidgetRenderer
            key={partialKey}
            widgetCode={partial.widgetCode}
            isStreaming={true}
            title={partial.title}
            showOverlay={partial.scriptsTruncated}
          />
        ) : (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <span className="animate-soft-pulse">Widget を生成中...</span>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
