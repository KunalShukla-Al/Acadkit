import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/components/primitives/tone";

/**
 * A figure the way the pages show one: the number large and
 * tabular, its unit small beside it, and what it counts underneath.
 * (The plan's "Number"; named Figure so it never shadows the global.)
 */
export function Figure({
  value,
  unit,
  label,
  tone = "ink",
  size = "md",
  className,
}: {
  value: string | number;
  unit?: string;
  label?: ReactNode;
  tone?: Tone;
  size?: "lg" | "md" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "tabular font-semibold leading-none tracking-tight",
          size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-xl",
          TONE[tone]
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-[0.45em] font-medium text-muted">{unit}</span>}
      </p>
      {label && <p className="mt-1.5 text-xs text-muted">{label}</p>}
    </div>
  );
}
