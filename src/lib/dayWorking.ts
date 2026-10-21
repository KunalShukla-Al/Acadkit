/**
 * Show your work for a day of the survival plan (src/lib/survival.ts): in
 * a module of its own so only the explainers load it.
 */
import type { Subject } from "@acadkit/core/types";
import { count, type Working } from "@acadkit/core/working";
import type { PlannedClass, SurvivalPlan } from "@/lib/survival";

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const name = (s: Subject) => s.short_name?.trim() || s.name;

/**
 * Whether a day of the plan is free, with its working: for each of its
 * classes, how many of that subject's classes left you need, how many you
 * can miss (the earliest ones), and where this class falls among them.
 */
export function dayWorking(plan: SurvivalPlan, date: string): Working<{ free: boolean }> | null {
  const day = plan.days.find((d) => d.date === date);
  if (!day) return null;
  // Each class's place among its subject's classes left, counted from the plan's first day.
  const seen = new Map<string, number>();
  const place = new Map<PlannedClass, number>();
  for (const d of plan.days) {
    if (d.date > date) break;
    for (const c of d.classes) {
      const k = (seen.get(c.subject.id) ?? 0) + 1;
      seen.set(c.subject.id, k);
      if (d.date === date) place.set(c, k);
    }
  }
  const steps = day.classes.map((c) => {
    const o = plan.subjects.find((x) => x.subject.id === c.subject.id)!;
    const at = c.slot.start_time.slice(0, 5);
    if (!o.reachable)
      return { say: `${name(c.subject)} at ${at}: even all ${o.remaining} classes left won't reach ${o.min}%, so missing this one changes nothing.` };
    const k = place.get(c)!;
    const left = `${count(o.remaining, "class", "classes")} of ${name(c.subject)} left`;
    const spare = !o.needed
      ? `You don't need any of the ${left}, so you can miss them all`
      : `You need ${o.needed} of the ${left}, so ${o.slack ? `you can miss the first ${o.slack}` : "you can't miss any"}`;
    return c.required
      ? { say: `${spare}. The one at ${at} is the ${ordinal(k)}, so it's needed.`, sum: `${k} > ${o.slack}` }
      : { say: `${spare}. The one at ${at} is the ${ordinal(k)}, one of those.`, sum: `${k} ≤ ${o.slack}` };
  });
  steps.push({
    say: day.free ? "No class that day is needed, so the day is free." : `${count(day.requiredCount, "class", "classes")} that day ${day.requiredCount === 1 ? "is" : "are"} needed, so it isn't free.`,
  });
  // Each class's flag, for the scene: class0, class1, … are 1 when needed.
  const flags = Object.fromEntries(day.classes.map((c, i) => [`class${i}`, c.required ? 1 : 0]));
  return { value: { free: day.free }, steps, figures: { classes: day.classes.length, required: day.requiredCount, ...flags } };
}
