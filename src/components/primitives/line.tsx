import type { LucideIcon } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/components/primitives/tone";

/**
 * One line of information, the way the pages say things: a mark
 * (a subject's colour, or an icon), the sentence, and a value at the end.
 * No box: lines sit on the page.
 */
export function Line({
  dot,
  icon: Icon,
  value,
  tone = "ink",
  children,
  className,
}: {
  /** A subject's colour, as a dot before the line. */
  dot?: string;
  icon?: LucideIcon;
  value?: React.ReactNode;
  /** The value's colour. */
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-baseline gap-2.5 py-1.5 text-sm", className)}>
      {dot && <Dot color={dot} className="h-2 w-2 self-center" />}
      {Icon && <Icon className="h-4 w-4 shrink-0 self-center text-muted" aria-hidden />}
      <span className="min-w-0 flex-1">{children}</span>
      {value !== undefined && <span className={cn("tabular shrink-0", tone === "ink" ? "text-muted" : TONE[tone])}>{value}</span>}
    </p>
  );
}
