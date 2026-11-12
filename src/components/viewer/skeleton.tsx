/** A PDF opening: a couple of paper-shaped pages with a soft sweep, held at the viewer's width until the real pages draw. A4 portrait is the study folder's common shape, so the placeholder sits close to the page that replaces it. */
export function PdfSkeleton({ width }: { width?: number }) {
  // No width yet (the file still downloading): each page fills the space it's given, A4-shaped.
  const page = width ? { height: Math.round(width * 1.414) } : { aspectRatio: "1 / 1.414" };
  return (
    <div className="space-y-3" style={{ width: width || undefined }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="pdf-skeleton relative overflow-hidden rounded-md bg-white shadow-xs"
          style={page}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Opening…</span>
    </div>
  );
}

/** Lengths for the placeholder lines: ragged like real text, not a grid of bars. */
const LINES = ["38%", "100%", "94%", "97%", "71%", "100%", "88%", "96%", "62%", "100%", "91%", "54%"];

/** A Word file, sheet or code file opening: a heading and lines of text with the same soft sweep, in place of a bare "Opening…". */
export function DocSkeleton() {
  return (
    <div className="pdf-skeleton relative space-y-3 overflow-hidden rounded-md border bg-surface p-5">
      {LINES.map((w, i) => (
        <div key={i} className={i === 0 ? "mb-5 h-5 rounded bg-surface-2" : "h-3 rounded bg-surface-2"} style={{ width: w }} aria-hidden="true" />
      ))}
      <span className="sr-only">Opening…</span>
    </div>
  );
}
