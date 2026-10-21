/**
 * A screenshot of SRM's student portal, sent from the iPhone (Back Tap,
 * the AcadKit Screenshot Shortcut) and recognised by Autopilot
 * (scripts/lib/autopilot.mjs): its attendance table or its marks table is
 * read into the app, the same rows a pasted portal page makes
 * (src/api/portal.ts). Attendance snapshots keep "screenshot" as their
 * history's source (migration 058); marks land as the paste's do
 * (core/portalMarks.ts).
 *
 * Every row is checked before it is written: a course on the account,
 * attendance with no more absences than classes and a percentage that
 * agrees with the two, marks no more than they are out of.
 *
 * Each import leaves an autopilot_actions row (kind "portal", migration
 * 059) that says what changed and keeps every row as it was, so Today can
 * show it and undo it exactly.
 */
import { randomUUID } from "node:crypto";
import { inferType } from "../../packages/core/src/plan.ts";
import { subjectShort } from "../../packages/core/src/subjectShort.ts";
import { planPortalMarks } from "../../packages/core/src/portalMarks.ts";
import { ask as askModel } from "./ollama.mjs";

/** How far a row's percentage may sit from conducted and absent before it's called misread. */
const PCT_SLACK = 1.5;

export function portalSchema() {
  return {
    type: "object",
    properties: {
      attendance: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            conducted: { type: "integer", minimum: 0 },
            absent: { type: "integer", minimum: 0 },
            percent: { type: ["number", "null"] },
          },
          required: ["code", "conducted", "absent", "percent"],
          additionalProperties: false,
        },
      },
      marks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            test: { type: "string" },
            obtained: { type: "number", minimum: 0 },
            max: { type: "number", minimum: 0 },
          },
          required: ["code", "test", "obtained", "max"],
          additionalProperties: false,
        },
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["attendance", "marks", "confidence"],
    additionalProperties: false,
  };
}

export function portalPrompt(subjects) {
  return [
    "This is a screenshot of a university student portal: its attendance page or its marks page. Read the table it shows, in JSON, and leave the other list empty.",
    '- attendance: per course, code (as printed, "21CSC202J"), conducted (hours conducted), absent (hours absent), percent (the percentage shown, or null).',
    '- marks: per test, code, test (its name as printed, "FT-I", "CLA-1"), obtained (the marks scored) and max (what it is out of, from "8.5/10" or the header).',
    `The student's courses: ${subjects.map((s) => s.code).join(", ")}.`,
    "Leave out rows that aren't courses or tests (totals, headers). confidence: from 0 to 1, how sure you are of every number.",
  ].join("\n");
}

const norm = (code) => String(code).replace(/\s/g, "").toUpperCase();

/** The attendance rows worth writing, and why each other one was left out. */
export function checkAttendance(rows, subjects) {
  const codes = new Set(subjects.map((s) => norm(s.code)));
  const kept = [];
  const dropped = [];
  for (const r of rows) {
    const code = norm(r.code);
    const why = !codes.has(code)
      ? "not one of your courses"
      : r.absent > r.conducted
        ? "more absences than classes"
        : r.percent !== null && r.conducted > 0 && Math.abs(((r.conducted - r.absent) / r.conducted) * 100 - r.percent) > PCT_SLACK
          ? `${r.percent}% doesn't match ${r.conducted - r.absent} of ${r.conducted}`
          : null;
    if (why) dropped.push({ code, why });
    else if (!kept.some((k) => k.code === code)) kept.push({ code, conducted: r.conducted, absent: r.absent, percent: r.percent });
  }
  return { kept, dropped };
}

/** The marks worth writing, as core's PortalMark, and why each other one was left out. */
export function checkMarks(rows, subjects) {
  const codes = new Set(subjects.map((s) => norm(s.code)));
  const kept = [];
  const dropped = [];
  for (const r of rows) {
    const code = norm(r.code);
    const why = !codes.has(code) ? "not one of your courses" : r.max <= 0 || r.obtained > r.max ? `${r.obtained} out of ${r.max} can't be` : null;
    if (why) dropped.push({ code: `${code} ${r.test}`, why });
    else kept.push({ subject_code: code, label: r.test.trim(), marks_obtained: r.obtained, max_marks: r.max, component_type: inferType(r.test) });
  }
  return { kept, dropped };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (n) => (n === null || n === undefined ? "–" : `${Number(n).toFixed(1)}%`);
const num = (n) => String(Number(n));

/** "OS 64.6% (was 66.0%), DSA 75.0% (new), and 3 more": a list that stays one line. */
function listed(items, max = 4) {
  return items.length > max ? `${items.slice(0, max).join(", ")}, and ${items.length - max} more` : items.join(", ");
}

/**
 * What changed, as Today's line says it: each course's attendance against
 * what it was, each mark against what it was, "new" for what wasn't there.
 */
export function changed({ attendance, marks, before, subjects }) {
  const short = (code) => {
    const s = subjects.find((x) => norm(x.code) === norm(code));
    return s ? subjectShort({ code: s.code, name: s.name ?? s.code, short_name: s.short_name ?? null }) : code;
  };
  const att = attendance.map((r) => {
    const was = before.snapshots.get(r.code);
    return `${short(r.code)} ${pct(r.percent)} (${was ? `was ${pct(was.percentage)}` : "new"})`;
  });
  const mk = marks.map((m) => {
    const was = before.marks.get(m.id);
    return `${short(m.code)} ${m.label} ${num(m.marks_obtained)}/${num(m.max_marks)}${was ? ` (was ${num(was.marks_obtained)})` : " (new)"}`;
  });
  return [att.length ? `attendance ${listed(att)}` : "", mk.length ? `marks ${listed(mk)}` : ""].filter(Boolean).join("; ");
}

/**
 * Reads the screenshot's table and writes what it holds. Returns what it
 * did as one line, with the attendance and marks kept and what was left out.
 */
export async function importPortalShot({ supabase, pin, source, page, subjects, today, ask = askModel, sure = 0.7 }) {
  const read = await ask({ prompt: portalPrompt(subjects), images: page.images, schema: portalSchema(), maxTokens: 2048 });
  const none = { attendance: [], marks: { updated: 0, added: 0 }, dropped: [] };
  if (read.confidence < sure) return { said: `Not sure enough of the numbers on ${source} (${Math.round(read.confidence * 100)}%); nothing imported.`, ...none };
  const attendance = checkAttendance(read.attendance, subjects);
  const marks = checkMarks(read.marks, subjects);
  const dropped = [...attendance.dropped, ...marks.dropped];
  if (!attendance.kept.length && !marks.kept.length) return { said: `Nothing on ${source} matched your courses; nothing imported.`, ...none, dropped };

  // As every row was, for Undo: the snapshots of these courses, and the marks a portal mark lands on.
  const now = new Date().toISOString();
  const snapRows = attendance.kept.map((r) => ({ device_id: pin, subject_code: r.code, conducted: r.conducted, absent: r.absent, percentage: r.percent, as_of: today, synced_at: now }));
  const historyRows = snapRows.map((r) => ({ ...r, id: randomUUID(), source: "screenshot" }));
  const was = attendance.kept.length ? await supabase.from("portal_snapshots").select("subject_code, conducted, absent, percentage, as_of, synced_at").eq("device_id", pin) : { data: [] };
  if (was.error) throw new Error(`Couldn't read the attendance: ${was.error.message}`);
  const before = { snapshots: new Map(was.data.map((r) => [r.subject_code, r])), marks: new Map() };
  let plan = { updates: [], inserts: [] };
  const codeOf = new Map();
  if (marks.kept.length) {
    const ids = await supabase.from("subjects").select("id, code").eq("device_id", pin);
    const have = await supabase.from("marks").select("id, subject_id, label, source, component_type, marks_obtained, max_marks").eq("device_id", pin).eq("is_external", false);
    for (const r of [ids, have]) if (r.error) throw new Error(`Couldn't read the marks: ${r.error.message}`);
    plan = planPortalMarks(pin, marks.kept, ids.data, have.data);
    for (const sub of ids.data) codeOf.set(sub.id, sub.code);
    plan.inserts = plan.inserts.map((m) => ({ id: randomUUID(), ...m }));
    for (const u of plan.updates) {
      const row = have.data.find((m) => m.id === u.id);
      before.marks.set(u.id, { label: row.label, source: row.source, component_type: row.component_type, marks_obtained: row.marks_obtained, max_marks: row.max_marks });
    }
  }
  const markChanges = [...plan.updates, ...plan.inserts].map((m) => ({ ...m, code: codeOf.get(m.subject_id) ?? "" }));
  const what = changed({ attendance: attendance.kept, marks: markChanges, before, subjects });
  const changes = {
    snapshots: attendance.kept.map((r) => ({ code: r.code, before: before.snapshots.get(r.code) ?? null })),
    history: historyRows.map((r) => r.id),
    marks: [...plan.updates, ...plan.inserts].map((m) => ({ id: m.id, before: before.marks.get(m.id) ?? null })),
  };
  // The action first, so nothing is written without its Undo.
  const { data: recorded, error: actErr } = await supabase
    .from("autopilot_actions")
    .insert({ device_id: pin, kind: "portal", source, said: `Portal: ${what}.`, confidence: read.confidence, changes })
    .select("id")
    .single();
  if (actErr) throw new Error(`Couldn't record what Autopilot did: ${actErr.message}`);

  try {
    if (snapRows.length) {
      const up = await supabase.from("portal_snapshots").upsert(snapRows, { onConflict: "device_id,subject_code" });
      if (up.error) throw new Error(`Couldn't save the attendance: ${up.error.message}`);
      const history = await supabase.from("portal_snapshot_history").insert(historyRows);
      if (history.error) throw new Error(`Couldn't keep the attendance's history: ${history.error.message}`);
    }
    if (plan.updates.length) {
      const { error } = await supabase.from("marks").upsert(plan.updates, { onConflict: "id" });
      if (error) throw new Error(`Couldn't update the marks: ${error.message}`);
    }
    if (plan.inserts.length) {
      const { error } = await supabase.from("marks").insert(plan.inserts);
      if (error) throw new Error(`Couldn't add the marks: ${error.message}`);
    }
  } catch (err) {
    await supabase.from("autopilot_actions").delete().eq("id", recorded.id);
    throw err;
  }
  const counts = { updated: plan.updates.length, added: plan.inserts.length };

  const did = [
    ...(attendance.kept.length ? [`attendance for ${plural(attendance.kept.length, "course")}`] : []),
    ...(counts.updated ? [`${plural(counts.updated, "mark")} updated`] : []),
    ...(counts.added ? [`${plural(counts.added, "mark")} added`] : []),
  ];
  const left = dropped.length ? `; left out ${dropped.map((d) => `${d.code} (${d.why})`).join(", ")}` : "";
  return { said: `Portal from ${source}: ${did.join(", ")}${left}.`, attendance: attendance.kept, marks: counts, dropped, action: recorded };
}
