/** Which earlier units each unit leans on: the past-paper export's hand-checked list plus links found by meaning, sent by the sync as <pin>/prereqs.json. */

export interface PrereqNeed {
  course: string;
  /** Null: the whole course (no unit-level syllabus for Sem 1-2). */
  unit: number | null;
  title: string;
  why: string;
  source: "curated" | "auto";
  /** Same-semester course to take first, not an earlier one. */
  alongside?: boolean;
  score?: number;
}

export interface PrereqLink {
  course: string;
  unit: number | null;
  needs: PrereqNeed[];
}

export interface PrereqsData {
  version: 1;
  links: PrereqLink[];
}

/**
 * A course's links, unit by unit, hand-checked ones first. Links found by meaning alone are kept
 * only for units with no hand-checked ones, at most two: they are suggestions, not facts.
 */
export function prereqsFor(data: PrereqsData | null | undefined, code: string): PrereqLink[] {
  const links = (data?.links ?? []).filter((l) => l.course === code);
  return links
    .map((l) => {
      const curated = l.needs.filter((n) => n.source === "curated");
      return { ...l, needs: curated.length ? curated : l.needs.slice(0, 2) };
    })
    .filter((l) => l.needs.length)
    .sort((a, b) => (a.unit ?? 0) - (b.unit ?? 0));
}
