import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-3xl px-6", className)}
      {...props}
    >
      {children}
    </div>
  );
}
