import type { Subject } from "./types.ts";

const SMALL = new Set(["and", "of", "the", "for", "in", "to", "a", "an", "&"]);

/**
 * A subject's name in a few letters, for chips: the short name you typed, else its initials
 * ("Data Structures and Algorithms" → "DSA"), else a one-word name as it is.
 */
export function subjectShort(subject: Pick<Subject, "name" | "short_name">): string {
  const typed = subject.short_name?.trim();
  if (typed) return typed;
  const words = subject.name.trim().split(/[\s_-]+/).filter(Boolean);
  const big = words.filter((w) => !SMALL.has(w.toLowerCase()));
  if (big.length <= 1) return subject.name.trim();
  return big.map((w) => (/^[IVX]+$/.test(w) ? w : w[0].toUpperCase())).join("");
}

/** A test with its subject in front, unless its title names it already: "End-sem" → "TBVP End-sem". */
export function testTitle(title: string, subject: Pick<Subject, "name" | "short_name"> | undefined): string {
  if (!subject) return title;
  const short = subjectShort(subject);
  return title.toUpperCase().includes(short.toUpperCase()) ? title : `${short} ${title}`;
}
