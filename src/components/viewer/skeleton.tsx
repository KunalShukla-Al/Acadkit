/** A PDF opening: a couple of paper-shaped pages with a soft sweep, held at the viewer's width until the real pages draw. A4 portrait is the study folder's common shape, so the placeholder sits close to the page that replaces it. */
export function PdfSkeleton({ width }: { width: number }) {
  const height = Math.round((width || 320) * 1.414);
  return (
    <div className="space-y-3" style={{ width: width || undefined }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="pdf-skeleton relative overflow-hidden rounded-md bg-white shadow-xs"
          style={{ height }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Opening…</span>
    </div>
  );
}
