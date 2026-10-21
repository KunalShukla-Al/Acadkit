/**
 * What a spoken question asks: the grammar behind "Hey Siri, AcadKit". Siri
 * hands the Shortcut what you said as text; this turns it into one of a few
 * questions the app can answer, and the subject it is about.
 *
 *   skip       "can I skip OS today", "how many classes can I bunk in DSA"
 *   need       "what do I need in OS", "how much do I need for an A in FDS"
 *   next-test  "when is my next test", "next OS exam"
 *   absent     "I'm absent in OS", "mark me absent for DSA yesterday"
 *
 * It reads plain words, not a model: a question it can't place is "unknown",
 * and the answer says what it can do.
 */
import { subjectShort } from "./subjectShort.ts";
import type { Grade, Subject } from "./types.ts";

export type AskKind = "skip" | "need" | "next-test" | "absent" | "unknown";

export interface Ask {
  kind: AskKind;
  /** The subject's code, when the question names one. */
  subject: string | null;
  /** "absent": which day, 0 = today, -1 = yesterday. */
  day: 0 | -1;
  /** "need": the grade asked about, when one is named. */
  grade: Grade | null;
  /** The lab's classes ("absent in DSA lab"), the theory's, or both. */
  session: "lab" | "theory" | null;
}

/** Lower case, curly quotes straightened, punctuation gone, spaces single. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9+' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TEST = String.raw`(test|exam|ct|ft|fj|quiz|assessment|cycle test|internal|lab test|end ?sem|end semester)s?`;
// Hinglish, as it is said to Siri: "nahi gaya" (didn't go), "kab" (when), "agla" (next), "chahiye" (needed), "kitna" (how much).
const ABSENT = /\b(i'?m|i am|i was|i will be|i'll be|im|mark me|put me|me)\s+(absent|not (in|at|coming to|going to)|missing|skipping|bunking|not attending)\b|\b(missed|skipped|bunked)\b|\babsent (in|for|from|today|yesterday)\b|\bnahi (gaya|gayi|aaya|aayi|ja raha|ja rahi)\b/;
const NEXT_TEST = new RegExp(
  String.raw`\b(next|agla|agli)\b.*\b${TEST}\b|\b(when|what|which|any)('?s| is| are| do)?\b.*\b${TEST}\b|\b${TEST}\b.*\b(coming|next|soon|tomorrow|today|this week|kab)\b`
);
const NEED = /\b(need|needed|required|require|have to (get|score)|must (get|score)|chahiye)\b|\bhow (much|many marks)\b.*\b(score|get)\b/;
const SKIP = /\b(skip|bunk|miss|leave|cut|drop)\b|\bhow many (classes|lectures|periods)\b|\battendance\b/;

const GRADES: Grade[] = ["O", "A+", "A", "B+", "B", "C"];

/** "an a plus", "an o", "b+" → the grade; null when none is named. */
function gradeIn(text: string): Grade | null {
  // The article is skipped first, so "for a C" is a C and not an A.
  const m = /\b(?:for|get|grade|need|score)\s+(?:an?\s+)?(o|a\s*(?:\+|plus)|a|b\s*(?:\+|plus)|b|c)\b/.exec(text);
  if (!m) return null;
  const g = m[1].replace(/\s*(\+|plus)$/, "+").replace(/\s+/g, "").toUpperCase() as Grade;
  return GRADES.includes(g) ? g : null;
}

/** A subject named exactly: its code, its short name, or its full name. */
export function namedSubject(text: string, subjects: Pick<Subject, "code" | "name" | "short_name">[]): string | null {
  const words = ` ${text} `;
  for (const s of subjects) {
    const names = [s.code, s.short_name ?? "", s.name].map((n) => normalise(n)).filter((n) => n.length >= 2);
    if (names.some((n) => words.includes(` ${n} `))) return s.code;
  }
  return null;
}

type Named = Pick<Subject, "code" | "name" | "short_name">;

/** Words in a subject's name that say nothing about which subject it is. */
const FILLER = new Set("and of the for in to a an with basics introduction fundamentals principles advanced".split(" "));
/** What students call some courses: "maths" for any MA-coded course, "java" and "oops" for OOP. */
const ALIASES: [RegExp, (s: Named) => boolean][] = [
  [/\b(maths?|m[1-4])\b/, (s) => /^\d{2}MA/.test(s.code)],
  [/\b(java|oops?)\b/, (s) => /object oriented|\boop\b/i.test(s.name) || /oop/i.test(s.short_name ?? "")],
];

/**
 * A subject named loosely: exactly (code, short name, full name), by the
 * initials its name gives ("OS" for Operating Systems), by words that begin
 * its name's words ("operating", "data structures"), or by what students
 * call it ("maths"). The subject with the most such words wins; a tie names
 * none, so "data" alone is neither DSA nor Data Science.
 */
export function looseSubject(text: string, subjects: Named[]): string | null {
  const exact = namedSubject(text, subjects);
  if (exact) return exact;
  const words = text.split(" ").filter(Boolean);
  const scored = subjects.map((s) => {
    const nameWords = normalise(s.name).split(" ").filter((w) => w.length >= 3 && !FILLER.has(w));
    let score = words.includes(normalise(subjectShort(s))) ? 2 : 0;
    for (const w of words) if (w.length >= 4 && !FILLER.has(w) && nameWords.some((n) => n.startsWith(w) || w.startsWith(n))) score++;
    for (const [re, fits] of ALIASES) if (re.test(text) && fits(s)) score += 2;
    return { code: s.code, score };
  });
  const best = Math.max(0, ...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  return best > 0 && top.length === 1 ? top[0].code : null;
}

export function parseAsk(text: string, subjects: Named[], find = looseSubject): Ask {
  const t = normalise(text);
  const subject = find(t, subjects);
  const session = /\b(lab|labs|practical|practicals)\b/.test(t) ? ("lab" as const) : /\b(theory|lecture)\b/.test(t) ? ("theory" as const) : null;
  const base = { subject, day: 0 as const, grade: null, session };
  // A question about skipping ("can I skip", "should I bunk") is not a report of being absent.
  const asking = /^(can|could|should|may|shall|is it ok|is it fine|am i allowed|how many|do i)\b/.test(t);
  // "kal" is yesterday and tomorrow both; with a past tense it can only be yesterday.
  const yesterday = /\byesterday\b/.test(t) || (/\bkal\b/.test(t) && /\b(gaya|gayi|aaya|aayi)\b/.test(t));
  if (!asking && ABSENT.test(t)) return { ...base, kind: "absent", day: yesterday ? -1 : 0 };
  // Before the test question: "what do I need in the end sem" asks about marks.
  if (NEED.test(t)) return { ...base, kind: "need", grade: gradeIn(t) };
  if (NEXT_TEST.test(t)) return { ...base, kind: "next-test" };
  if (SKIP.test(t)) return { ...base, kind: "skip" };
  return { ...base, kind: "unknown" };
}
