/**
 * Where each mark read off the portal lands: on the row the account
 * already has for that test, matched the way the app matches labels
 * ("FT-I" is "FT-1" is "CT-1"), the portal's own row first and then one
 * typed in by hand, whose value the portal's replaces; otherwise a new
 * row. One test, one row: keeping both counted it twice. Used by a pasted
 * portal page (src/api/portal.ts) and a portal screenshot read on the Mac
 * (scripts/lib/portal-shot.mjs).
 */
import { labelMatchKey } from "./componentLabel.ts";
import type { MarkComponentType } from "./types.ts";

export interface PortalMark {
  subject_code: string;
  label: string;
  max_marks: number;
  marks_obtained: number;
  component_type: MarkComponentType;
}

export interface PortalMarkRow {
  device_id: string;
  subject_id: string;
  component_type: MarkComponentType;
  label: string;
  marks_obtained: number;
  max_marks: number;
  is_external: false;
  source: "portal";
}

export function planPortalMarks(
  pin: string,
  marks: PortalMark[],
  subjects: { id: string; code: string }[],
  existing: { id: string; subject_id: string; label: string; source: string }[]
): { updates: (PortalMarkRow & { id: string })[]; inserts: PortalMarkRow[]; unmatched: string[] } {
  const byCode = new Map(subjects.map((s) => [s.code.trim().toUpperCase(), s.id]));
  const seen = new Map<string, string>();
  for (const m of [...existing].sort((a, b) => (a.source === "portal" ? -1 : 0) - (b.source === "portal" ? -1 : 0))) {
    const key = `${m.subject_id}|${labelMatchKey(m.label)}`;
    if (!seen.has(key)) seen.set(key, m.id);
  }
  const unmatched = new Set<string>();
  const updates: (PortalMarkRow & { id: string })[] = [];
  const inserts: PortalMarkRow[] = [];
  for (const m of marks) {
    const subjectId = byCode.get(m.subject_code.trim().toUpperCase());
    if (!subjectId) {
      unmatched.add(m.subject_code);
      continue;
    }
    const row: PortalMarkRow = {
      device_id: pin,
      subject_id: subjectId,
      component_type: m.component_type,
      label: m.label,
      marks_obtained: m.marks_obtained,
      max_marks: m.max_marks,
      is_external: false,
      source: "portal",
    };
    const id = seen.get(`${subjectId}|${labelMatchKey(m.label)}`);
    if (id) updates.push({ id, ...row });
    else inserts.push(row);
  }
  return { updates, inserts, unmatched: [...unmatched] };
}
