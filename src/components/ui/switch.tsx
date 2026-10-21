import { cn } from "@/lib/utils";

/** An on/off switch: a track with a knob, read out as a switch. */
export function Switch({
  checked,
  onChange,
  label,
  tone = "good",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What it switches, for screen readers. */
  label: string;
  /** The track's colour when on. */
  tone?: "good" | "accent";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? (tone === "good" ? "bg-good" : "bg-accent") : "bg-surface-2"
      )}
    >
      {/* left-0 matters: an absolute box with `left: auto` falls back to its static position (24px here), and the translate then puts the knob outside the track. */}
      <span
        className={cn(
          "absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
