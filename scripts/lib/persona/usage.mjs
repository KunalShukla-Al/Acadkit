/**
 * The 14-day cut rule's numbers (docs/persona.md): what I did with each PersonaOS engine's output.
 * An engine with nothing used in 14 days is redesigned or removed. `npm run persona -- usage`
 * prints them, and the Sunday brief carries one line.
 *
 *   deadlines   dates from my groups offered in the app, and how many I added or dismissed
 *   brief       morning briefs pushed
 *   ask         questions asked on the Desk (each one can read the groups' messages)
 *
 * The calendar and the widget are read by the phone without telling the Mac, so they can't be counted.
 */

const DAYS = 14;

export async function usage({ supabase, pin, now = new Date() }) {
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
  const [{ data: offered, error: e1 }, { count: briefs, error: e2 }, { data: asks, error: e3 }] = await Promise.all([
    supabase.from("suggestions").select("status").eq("device_id", pin).eq("kind", "deadline").like("source", "WhatsApp%").gte("created_at", since),
    supabase.from("sent_notifications").select("id", { count: "exact", head: true }).eq("device_id", pin).eq("kind", "persona_brief").gte("sent_at", since),
    supabase.storage.from("study-files").list(`${pin}/ask`, { limit: 1000 }),
  ]);
  const err = e1 ?? e2 ?? e3;
  if (err) throw new Error(err.message);
  const by = (s) => (offered ?? []).filter((r) => r.status === s).length;
  return {
    deadlines: { offered: (offered ?? []).length, added: by("accepted"), dismissed: by("dismissed") },
    briefs: briefs ?? 0,
    asks: (asks ?? []).filter((o) => o.name !== "heartbeat.json" && (o.updated_at ?? o.created_at ?? "") >= since).length,
  };
}

/** One line per engine, and which went unused. */
export function usageLines(u) {
  const lines = [
    `Deadlines from my groups: ${u.deadlines.offered} offered, ${u.deadlines.added} added, ${u.deadlines.dismissed} dismissed`,
    `Morning brief: ${u.briefs} pushed`,
    `Ask: ${u.asks} question${u.asks === 1 ? "" : "s"}`,
  ];
  const idle = [u.deadlines.added === 0 && "deadlines", u.briefs === 0 && "brief", u.asks === 0 && "ask"].filter(Boolean);
  if (idle.length) lines.push(`Unused for ${DAYS} days: ${idle.join(", ")}. Redesign or remove.`);
  return lines;
}

/** The Sunday brief's line. */
export function usageBrief(u) {
  return `PersonaOS, last ${DAYS} days: ${u.deadlines.added} date${u.deadlines.added === 1 ? "" : "s"} added from your groups, ${u.asks} Ask question${u.asks === 1 ? "" : "s"}, ${u.briefs} brief${u.briefs === 1 ? "" : "s"}.`;
}
