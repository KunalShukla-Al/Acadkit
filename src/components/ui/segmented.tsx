import { motion } from "motion/react";
import { cn, haptic } from "@/lib/utils";

interface SegmentedProps<T extends string | number> {
  /** `highlight` lights up the tab's label (e.g. "today") without adding to the label text. */
  options: Array<{ value: T; label: string; highlight?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  /** `sm` is the compact switch for screens that need the room (the Desk). */
  size?: "md" | "sm";
  className?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  layoutId,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const sm = size === "sm";
  return (
    <div
      role="tablist"
      className={cn("flex bg-surface-2/80", sm ? "rounded-xl p-0.5" : "rounded-2xl p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic();
              onChange(opt.value);
            }}
            className={cn(
              "relative flex-1 px-3 text-sm font-semibold transition-colors",
              sm ? "rounded-[10px] py-1.5" : "rounded-xl py-2",
              active ? "text-ink" : opt.highlight ? "text-accent" : "text-muted hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={cn("absolute inset-0 bg-surface shadow-card", sm ? "rounded-[10px]" : "rounded-xl")}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
