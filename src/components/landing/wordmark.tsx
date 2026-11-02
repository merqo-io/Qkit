import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-display font-semibold tracking-tight", className)}
    >
      <span className="text-primary">q</span>
      kit
    </span>
  );
}
