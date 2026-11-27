/**
 * How many Claude calls PersonaOS's jobs may make in a day, so background
 * work never eats the plan's weekly limit. PERSONA_CLAUDE_CAP in .env.local,
 * 20 by default. The Desk's Ask is mine and isn't counted.
 */

export const DEFAULT_CAP = 20;

export function capOf(env = process.env) {
  const n = Number(env.PERSONA_CLAUDE_CAP);
  return env.PERSONA_CLAUDE_CAP !== undefined && Number.isInteger(n) && n >= 0 ? n : DEFAULT_CAP;
}

const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** `{ ok, budget }`: whether `n` more calls fit today's cap, and the budget after spending them. */
export function spend(budget, n, cap, now) {
  const day = dayOf(now);
  const used = budget?.day === day ? budget.used : 0;
  if (used + n > cap) return { ok: false, budget: { day, used } };
  return { ok: true, budget: { day, used: used + n } };
}
