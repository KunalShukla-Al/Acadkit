
/** The SRM portal parser. */

export interface PortalAttendanceRow {
  subject_code: string;
  conducted: number;
  absent: number;
  percentage: number | null;
  /** The course's name, when the table has a title column. Onboarding makes subjects from these. */
  title?: string;
  /** "Theory" / "Practical", when the table says. */
  category?: string;
  faculty?: string;
}

// ---------- text primitives ----------

/** Collapse whitespace, including the non-breaking spaces these pages are full of. */
export function norm(s: unknown): string {
  return String(s == null ? "" : s)
    // Escaped rather than literal: an invisible U+00A0 in the source
    // reads as a plain space to anyone reviewing it, and this is
    // load-bearing - the portal pads every cell with them.
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function low(s: unknown): string {
  return norm(s).toLowerCase();
}

export function num(s: unknown): number | null {
  const m = norm(s).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Every table across a set of documents, in order. */
export function tablesIn(docs: Array<Document | Element>): Element[] {
  const out: Element[] = [];
  for (const doc of docs) {
    const found = doc.querySelectorAll("table");
    for (let i = 0; i < found.length; i++) out.push(found[i]);
  }
  return out;
}

// ---------- table primitives ----------

/** Direct element children of `el` whose tag is in `tags`. */
function kids(el: Element, tags: string[]): Element[] {
  const out: Element[] = [];
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    if (tags.indexOf(children[i].tagName.toLowerCase()) > -1) out.push(children[i]);
  }
  return out;
}

/** A table's own rows, in document order, walking children explicitly rather than using `table.rows` - that property would also hand back rows belonging to tables nested inside a cell, which the marks report is full of. */
export function rowsOf(table: Element): Element[] {
  const out: Element[] = [];
  const children = table.children;
  for (let i = 0; i < children.length; i++) {
    const tag = children[i].tagName.toLowerCase();
    if (tag === "tr") out.push(children[i]);
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      for (const tr of kids(children[i], ["tr"])) out.push(tr);
    }
  }
  return out;
}

export function cellsOf(tr: Element): Element[] {
  return kids(tr, ["td", "th"]);
}

/** Header labels for a table: <thead> cells, else the first row. */
export function headersOf(table: Element): string[] {
  const head = kids(table, ["thead"])[0];
  const row = head ? kids(head, ["tr"])[0] : rowsOf(table)[0];
  if (!row) return [];
  return cellsOf(row).map((c) => low(c.textContent));
}

/**
 * Index of the first header matching `re`, or -1. `not` skips headers
 * that would otherwise be claimed by a broader pattern - "Total Hours
 * Absent" reads as both a conducted and an absent column otherwise.
 */
function col(hs: string[], re: RegExp, not?: RegExp): number {
  for (let i = 0; i < hs.length; i++) {
    if (not && not.test(hs[i])) continue;
    if (re.test(hs[i])) return i;
  }
  return -1;
}

/** Body rows, skipping the row that was consumed as the header. */
export function bodyRows(table: Element): Element[] {
  const all = rowsOf(table);
  const head = kids(table, ["thead"])[0];
  if (head) return all.slice(kids(head, ["tr"]).length);
  return all.slice(1);
}

// ---------- attendance ----------

const RE_CODE = /course\s*code|subject\s*code|^code$/;
const RE_CONDUCTED = /conducted|max.*hour|total\s*(?:class|hour)/;
const RE_ABSENT = /absent/;
/** Some portals report classes attended instead of missed; absences are then conducted − present. */
const RE_PRESENT = /present|attended/;
const RE_PCT = /%|percent/;
const RE_TITLE = /course\s*title|subject\s*(?:name|title)|course\s*name|description/;
const RE_CATEGORY = /category/;
const RE_FACULTY = /faculty/;

export function scrapeAttendance(all: Element[]): PortalAttendanceRow[] {
  for (const table of all) {
    const hs = headersOf(table);
    const iCode = col(hs, RE_CODE);
    const iCond = col(hs, RE_CONDUCTED, RE_ABSENT);
    const iAbs = col(hs, RE_ABSENT);
    const iPres = iAbs < 0 ? col(hs, RE_PRESENT) : -1;
    if (iCode < 0 || iCond < 0 || (iAbs < 0 && iPres < 0)) continue;

    const iPct = col(hs, RE_PCT);
    const iTitle = col(hs, RE_TITLE);
    const iCat = col(hs, RE_CATEGORY);
    const iFac = col(hs, RE_FACULTY);
    /** A text column's value for this row, or undefined when the table has no such column. */
    const text = (c: Element[], i: number) => (i >= 0 && c[i] ? norm(c[i].textContent) || undefined : undefined);
    const out: PortalAttendanceRow[] = [];
    for (const row of bodyRows(table)) {
      const c = cellsOf(row);
      if (!c || c.length <= Math.max(iCode, iCond, iAbs, iPres)) continue;
      const code = norm(c[iCode].textContent).toUpperCase();
      const conducted = num(c[iCond].textContent);
      let absent: number | null;
      if (iAbs >= 0) {
        absent = num(c[iAbs].textContent);
      } else {
        const present = num(c[iPres].textContent);
        absent = present === null || conducted === null ? null : conducted - present;
      }
      if (!code || conducted === null || absent === null || absent < 0) continue;
      out.push({
        subject_code: code,
        conducted,
        absent,
        percentage: iPct >= 0 && c[iPct] ? num(c[iPct].textContent) : null,
        title: text(c, iTitle),
        category: text(c, iCat),
        faculty: text(c, iFac),
      });
    }
    if (out.length) return out;
  }
  return [];
}

// ---------- diagnostics ----------

/** What the parser could see, for a human to read. */
const clip = (t: unknown): string => {
  const s = norm(t);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
};

export interface GridReport {
  container: string;
  rowSignature: string;
  rowCount: number;
  sample: string[][];
}

/**
 * Repeating non-table structures. A report laid out in divs otherwise
 * dumps `tables: []` and tells you only that the parser failed, not
 * what the markup actually is.
 */
export function gridsIn(docs: Array<Document | Element>): GridReport[] {
  const out: GridReport[] = [];
  const sig = (el: Element) =>
    el.tagName.toLowerCase() + "." + norm(el.className || "").replace(/\s+/g, ".");

  for (const doc of docs) {
    if (out.length >= 12) break;
    const nodes = doc.querySelectorAll(
      "[role=grid],[role=table],[role=rowgroup],div,ul,ol,section"
    );
    for (let i = 0; i < nodes.length && out.length < 12; i++) {
      const children = nodes[i].children;
      if (children.length < 3) continue;
      const first = sig(children[0]);
      if (!first) continue;
      let same = 0;
      for (let c = 0; c < children.length; c++) if (sig(children[c]) === first) same++;
      if (same < 3 || same < children.length - 1) continue;
      if (children[0].children.length < 2) continue;
      // Skip a container whose repetition is inherited from a child that
      // already qualified - the outermost match describes it better.
      if (nodes[i].querySelector("table")) continue;

      const rows: string[][] = [];
      for (let r = 0; r < Math.min(3, children.length); r++) {
        const cells = children[r].children;
        const line: string[] = [];
        for (let k = 0; k < cells.length; k++) line.push(clip(cells[k].textContent));
        rows.push(line);
      }
      out.push({ container: sig(nodes[i]), rowSignature: first, rowCount: same, sample: rows });
    }
  }
  return out;
}

export interface DiagnosticContext {
  url: string;
  hash: string;
  title: string;
  documents: number;
  blockedFrames: number;
}

export function diagnose(
  docs: Array<Document | Element>,
  all: Element[],
  context: DiagnosticContext
): string {
  const tables = all.map((table, index) => {
    const rows = bodyRows(table);
    const sample: string[][] = [];
    for (let r = 0; r < Math.min(2, rows.length); r++) {
      sample.push(cellsOf(rows[r]).map((c) => clip(c.textContent)));
    }
    return {
      index,
      headers: headersOf(table),
      rowCount: rows.length,
      nestedTables: table.querySelectorAll("table").length,
      sample,
    };
  });
  return JSON.stringify({ ...context, tables, grids: gridsIn(docs) }, null, 1);
}
