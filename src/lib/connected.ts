/**
 * Everything connected: what each page, slide, past-paper question,
 * lecture moment and board photo links to (scripts/lib/links.mjs, sent
 * by the sync as <pin>/links.json and a part per course).
 */

import { viewerHref } from "@/lib/viewer";

export type ItemKind = "page" | "slide" | "question" | "moment" | "photo";

export interface Link {
  id: string;
  kind: ItemKind;
  /** "time": on screen when it was said, or taken in that class. "meaning": about the same thing. */
  why: "time" | "meaning";
  /** How alike, centered, for a link by meaning. */
  score?: number;
}

export interface LinksIndex {
  version: 1;
  generatedAt: number;
  /** One per course folder ("Operating_Systems"), naming its part. */
  courses: { course: string; items: number; file: string }[];
}

export interface LinksPart {
  course: string;
  links: Record<string, Link[]>;
  /** What an id doesn't say: a question's paper file, label ("End-sem Dec 2025 · B21") and text. */
  questions?: Record<string, { path: string; label: string; text: string }>;
  /** A moment's time, "2026-11-03T10:14". */
  moments?: Record<string, { at: string }>;
}

/** What an item's id points at. */
export type Item =
  | { kind: "page" | "slide"; path: string; page: number }
  | { kind: "photo"; path: string }
  | { kind: "question"; paper: string; slot: string }
  | { kind: "moment"; memo: string; idx: number };

/** "slide:OS/02_Notes/x.pptx#24" → { kind, path, page }; null for an id this doesn't know. */
export function itemOf(id: string): Item | null {
  const colon = id.indexOf(":");
  const kind = id.slice(0, colon);
  const rest = id.slice(colon + 1);
  const hash = rest.lastIndexOf("#");
  const [head, tail] = hash === -1 ? [rest, ""] : [rest.slice(0, hash), rest.slice(hash + 1)];
  if ((kind === "page" || kind === "slide") && /^\d+$/.test(tail)) return { kind, path: head, page: Number(tail) };
  if (kind === "photo") return { kind, path: rest };
  if (kind === "question" && tail) return { kind, paper: head, slot: tail };
  if (kind === "moment" && /^\d+$/.test(tail)) return { kind, memo: head, idx: Number(tail) };
  return null;
}

/** The ids a study file's page has: as a page of notes or a slide of a deck. */
export const pageIds = (path: string, page: number) => [`page:${path}#${page}`, `slide:${path}#${page}`];
export const photoId = (path: string) => `photo:${path}`;
export const questionId = (paper: string, slot: string) => `question:${paper}#${slot}`;
export const momentId = (memo: string, idx: number) => `moment:${memo}#${idx}`;

/** The course folder an item belongs to, from a study-folder path: its top folder. */
export const courseOfPath = (path: string) => path.split("/")[0];

/**
 * An item's links, from any of its ids (a page may be a deck's slide),
 * each once: links by time first, then by meaning, best first.
 */
export function linksFor(part: LinksPart | null, ids: string[]): Link[] {
  if (!part) return [];
  const seen = new Set(ids);
  const out: Link[] = [];
  for (const id of ids)
    for (const l of part.links[id] ?? []) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
  const rank = (l: Link) => (l.why === "time" ? 2 : 1) + (l.score ?? 0);
  return out.sort((a, b) => rank(b) - rank(a));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** "CPU_Scheduling_Slides" from "OS/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx", cut to `max`. */
function fileStem(path: string, max = 26): string {
  const stem = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  return stem.length > max ? `${stem.slice(0, max - 1)}…` : stem;
}

/** What a link's chip says: "Slide 24 · CPU_Scheduling_Slides", "End-sem Dec 2025 · B21", "Lecture 3 Nov, 10:14". */
export function chipLabel(link: Link, part: LinksPart): string {
  const item = itemOf(link.id);
  if (!item) return link.id;
  if (item.kind === "slide") return `Slide ${item.page} · ${fileStem(item.path)}`;
  if (item.kind === "page") return `p. ${item.page} · ${fileStem(item.path)}`;
  if (item.kind === "question") return part.questions?.[link.id]?.label ?? `${item.paper} · ${item.slot}`;
  if (item.kind === "photo") {
    const date = /Class_Photos\/(\d{4}-\d{2}-\d{2})\//.exec(item.path)?.[1];
    return date ? `Board photo, ${shortDate(date)}` : "Board photo";
  }
  const at = part.moments?.[link.id]?.at;
  return at ? `Lecture ${shortDate(at)}, ${at.slice(11, 16)}` : "Lecture";
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/**
 * The labelled question a listed one is (Practice shows questions mined
 * from the papers, worded a little differently): the one from the same
 * paper file sharing most words with it, at least half. Null without one.
 */
export function questionFor(asked: { path: string | null; text: string }, part: LinksPart | null): string | null {
  if (!asked.path || !part?.questions) return null;
  const mine = words(asked.text);
  let best: { id: string; share: number } | null = null;
  for (const [id, q] of Object.entries(part.questions)) {
    if (q.path !== asked.path) continue;
    const theirs = words(q.text);
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    const share = shared / Math.max(1, Math.min(mine.size, theirs.size));
    if (share >= 0.5 && (!best || share > best.share)) best = { id, share };
  }
  return best?.id ?? null;
}

/** A course's folder from its code, by the study files the sync tagged with it. */
export function courseOfCode(files: { path: string; subject_code?: string | null }[] | undefined, code: string | null): string | null {
  if (!code) return null;
  const norm = (c: string) => c.replace(/\s/g, "").toUpperCase();
  const file = (files ?? []).find((f) => f.subject_code && norm(f.subject_code) === norm(code) && !/lab$/i.test(courseOfPath(f.path)));
  return file ? courseOfPath(file.path) : null;
}

/**
 * Where a link's chip opens: a page or slide in the viewer at that page, a
 * photo in the viewer, a question's paper, a moment in its transcript.
 * Null when the app can't (a lecture not synced yet). `lectures` maps a
 * recording's memo to its lecture's id.
 */
export function hrefOf(link: Link, part: LinksPart, lectures: Map<string, string>): string | null {
  const item = itemOf(link.id);
  if (!item) return null;
  if (item.kind === "page" || item.kind === "slide") return viewerHref(item.path, item.page);
  if (item.kind === "photo") return viewerHref(item.path);
  if (item.kind === "question") {
    const paper = part.questions?.[link.id]?.path;
    return paper ? viewerHref(paper) : null;
  }
  if (item.kind !== "moment") return null;
  const id = lectures.get(item.memo);
  return id ? `/lecture/${id}?m=${item.idx}` : null;
}
