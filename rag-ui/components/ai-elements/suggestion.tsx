"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Suggestions container (horizontal scroll)
// ---------------------------------------------------------------------------

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <ScrollArea
    className={cn("w-full whitespace-nowrap", className)}
    {...props}
  >
    <div className="flex items-center gap-2 pb-2">{children}</div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);

// ---------------------------------------------------------------------------
// Simple suggestion (pill button)
// ---------------------------------------------------------------------------

export type SuggestionProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: SuggestionProps) => (
  <Button
    variant={variant}
    size={size}
    className={cn("shrink-0 rounded-full text-xs font-normal", className)}
    onClick={() => onClick?.(suggestion)}
    {...props}
  >
    {suggestion}
  </Button>
);

// ---------------------------------------------------------------------------
// Rich suggestion card (title + description, click sends prompt)
// ---------------------------------------------------------------------------

export interface SuggestionCardData {
  /** Display title */
  title: string;
  /** Display description (shown below title) */
  description: string;
  /** Text inserted into input on click */
  prompt: string;
  /** Optional icon */
  icon?: ReactNode;
}

export type SuggestionCardProps = Omit<ComponentProps<"button">, "onClick"> & {
  data: SuggestionCardData;
  onClick?: (prompt: string) => void;
};

export const SuggestionCard = ({
  data,
  onClick,
  className,
  ...props
}: SuggestionCardProps) => (
  <button
    type="button"
    className={cn(
      "group/card flex flex-col items-start gap-1.5 rounded-xl border bg-card p-4 text-left",
      "transition-colors hover:bg-accent/50 hover:border-accent-foreground/20",
      "min-w-0 cursor-pointer whitespace-normal",
      className,
    )}
    onClick={() => onClick?.(data.prompt)}
    {...props}
  >
    {data.icon && (
      <span className="mb-0.5 text-muted-foreground group-hover/card:text-foreground transition-colors">
        {data.icon}
      </span>
    )}
    <span className="text-sm font-medium leading-snug line-clamp-1">
      {data.title}
    </span>
    <span className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
      {data.description}
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// SuggestionCards container (grid or horizontal scroll)
// ---------------------------------------------------------------------------

export type SuggestionCardsProps = ComponentProps<"div">;

export const SuggestionCards = ({
  className,
  children,
  ...props
}: SuggestionCardsProps) => (
  <div
    className={cn(
      "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
