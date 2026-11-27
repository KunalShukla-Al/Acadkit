import { Link } from "react-router-dom";
import { ChevronRight, GraduationCap } from "lucide-react";
import { useDeskIndex } from "@/hooks/useDesk";
import { countdown, upcomingTests } from "@/lib/desk";
import { cn } from "@/lib/utils";

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Every test on the Desk, soonest first: its window or exact day, its units
 * and a countdown. A test opens its Priorities.
 */
export function DeskTestsCard() {
  const { courses, today } = useDeskIndex();
  const tests = upcomingTests(courses, today);
  if (!tests.length) return null;
  return (
    <section className="card overflow-hidden p-0" aria-labelledby="desk-tests">
      <h2 id="desk-tests" className="flex items-center gap-2 px-4 pt-3 text-sm font-bold">
        <GraduationCap className="h-4 w-4 text-accent" /> Tests
      </h2>
      <ul className="mt-1 divide-y">
        {tests.map(({ course, test, day }) => {
          const when = test.date
            ? fmt(test.date)
            : test.start && test.end && test.start !== test.end
              ? `${fmt(test.start)} – ${fmt(test.end)} window`
              : test.start
                ? fmt(test.start)
                : "Date not set";
          const near = day && day <= today;
          return (
            <li key={`${course.key}-${test.id}`}>
              <Link
                to={`/desk/priorities?course=${course.key}&test=${encodeURIComponent(test.id)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60"
              >
                <span className="w-12 shrink-0 text-xs font-extrabold">{course.key}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{test.name}</span>
                  <span className="block truncate text-xs font-medium text-muted">
                    {when}
                    {test.units.length ? ` · unit${test.units.length > 1 ? "s" : ""} ${test.units.join(", ")}` : ""}
                  </span>
                </span>
                {day && (
                  <span className={cn("shrink-0 text-xs font-bold tabular", near ? "text-bad" : "text-muted")}>
                    {near && test.end && test.end >= today && day < today ? "on now" : countdown(day, today)}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
