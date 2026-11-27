import type { DeskIndexCourse } from "@/lib/desk";
import { cn } from "@/lib/utils";

/** The Desk's courses as pills; the picked one is `value`. */
export function CoursePills({
  courses,
  value,
  onChange,
}: {
  courses: DeskIndexCourse[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  if (courses.length < 2) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="group" aria-label="Course">
      {courses.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-pressed={value === c.key}
          title={c.name}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
            value === c.key ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"
          )}
        >
          {c.key}
          {c.semester && courses.some((o) => o.semester !== c.semester) ? <span className="ml-1 opacity-70">{c.semester}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Small pills for a short list of choices (tests, units, parts). */
export function Pills<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold",
            value === o.value ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
