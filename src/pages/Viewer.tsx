import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, FileQuestion } from "lucide-react";
import { usePin } from "@/hooks/useData";
import { fetchStudyBlob, fetchStudyManifest, studyDownloadUrl } from "@/api/studyFiles";
import { saveFile } from "@/lib/saveFile";
import { baseName, formatSize, prettyName, type StudyFile } from "@/lib/studyFiles";
import { codeLanguage, isRenderable, shownFile, viewerKind, type ViewerKind } from "@/lib/viewer";
import { ZoomPane } from "@/components/viewer/zoom-pane";
import { cn } from "@/lib/utils";
import {
  loadCodeView,
  loadDocxView,
  loadPdfView,
  loadSheetView,
  studyFileQuery,
} from "@/components/viewer/loaders";
import { DomFind, FindBar, FindButton, MatchRail } from "@/components/viewer/find-bar";
import { DomPager, PageCounter } from "@/components/viewer/page-counter";
import { goToPage, trackPages, type Pager } from "@/components/viewer/page-tracking";
import { ConnectedLine } from "@/components/connected-line";
import { reportReading } from "@/api/reading";
import { deviceKind } from "@/lib/reading";
import { courseOfPath, pageIds, photoId } from "@/lib/connected";
import { useFind } from "@/hooks/useFind";
import { useResetOn } from "@/hooks/useResetOn";
import type { Finder } from "@/components/viewer/find";
import { studyPath } from "@/lib/screens";

/** Files up to this size are fetched as the viewer opens, so Download can save them from the tap itself. */
const SAVE_AHEAD_BYTES = 40 * 1024 * 1024;

/** A PDF's largest size at 1×, in CSS px per PDF point (1.33 is "actual size"). */
const PDF_PX_PER_POINT = 1.5;

/** Each paged kind's pages, for the page counter; the rest count screenfuls. */
const PAGES: Partial<Record<ViewerKind, string>> = {
  pdf: '[id^="pdf-page-"]',
  docx: "section.docx",
};

const PdfView = lazy(loadPdfView);
const DocxView = lazy(loadDocxView);
const CodeView = lazy(loadCodeView);
const SheetView = lazy(loadSheetView);

/** A study file, opened inside the app: laid out to the screen, with the file's name and a Download button above it. */
export default function Viewer({ overlay = false }: { overlay?: boolean }) {
  const pin = usePin();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const path = params.get("path") ?? "";
  const page = Number(params.get("page")) || null;

  const manifest = useQuery({ queryKey: ["study-files", pin], queryFn: () => fetchStudyManifest(pin), staleTime: 5 * 60_000 });
  const file = useMemo(() => manifest.data?.files.find((f) => f.path === path) ?? null, [manifest.data, path]);

  // What to render: the file itself, or its converted preview.
  const shown = useMemo(() => (file ? shownFile(file) : null), [file]);
  const renderable = !!shown && isRenderable(shown.kind);

  // "study-file", not the old "study-blob": that key was persisted with the
  // cache, so a phone may hold an {} under it that must never be read.
  // Often already under way: rows prefetch on touch (loaders.ts).
  const blob = useQuery({
    queryKey: ["study-file", pin, shown?.key ?? null],
    queryFn: () => studyFileQuery(pin, file!).queryFn(),
    enabled: !!file && renderable,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  // The original file's bytes, ready before any tap, for Download: iOS only
  // lets the share sheet open straight from a tap (lib/saveFile.ts). When the
  // viewer shows the file itself this is the same query as `blob`; for a
  // converted preview (a note's web version, an old Office file) it's the
  // original, which is what should be saved. Very large files skip it and
  // use the signed link below.
  const original = useQuery({
    queryKey: ["study-file", pin, file?.key ?? null],
    queryFn: () => fetchStudyBlob(file!),
    enabled: !!file && file.size <= SAVE_AHEAD_BYTES,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  const saveable = original.data instanceof Blob ? original.data : null;
  // Fallback for a file too big to hold, or still loading: a signed link,
  // made before any tap since a download started after an await is a
  // blocked pop-up in Safari.
  const download = useQuery({
    queryKey: ["study-download", pin, file?.key],
    queryFn: () => studyDownloadUrl(file!),
    enabled: !!file,
    staleTime: 30 * 60_000,
  });

  // Page 1's width in points, for the PDF's widest at 1× (see ZoomPane below).
  const [pdfPoints, setPdfPoints] = useState<number | null>(null);
  useResetOn(shown?.key ?? null, () => setPdfPoints(null));
  // Where you are in the file (a page, or a screenful), for the page counter in the pill.
  const [pager, setPager] = useState<Pager | null>(null);
  // Continue (src/lib/reading.ts): the PDF page you settle on, for your other device to pick up.
  const readingPath = file?.path ?? null;
  const readingPage = shown?.kind === "pdf" ? (pager?.current ?? null) : null;
  useEffect(() => {
    if (!readingPath || readingPage === null) return;
    const t = setTimeout(() => void reportReading(pin, { path: readingPath, page: readingPage, kind: deviceKind() }).catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [pin, readingPath, readingPage]);

  const [finder, setFinder] = useState<Finder | null>(null);
  const onFinder = useCallback((f: Finder | null) => setFinder(f), []);
  const find = useFind(finder);
  const data = blob.data instanceof Blob ? blob.data : null;

  const title = file ? prettyName(baseName(file.path).replace(/\.[^.]+$/, "")) : "File";
  useEffect(() => {
    document.title = `${title} · AcadKit`;
    return () => {
      document.title = "AcadKit";
    };
  }, [title]);

  // Over a page (see AppRoutes in App.tsx), the page beneath must not move:
  // a drag on this header would otherwise scroll it, and closing the PDF
  // would land somewhere else. Locking the root keeps its scroll offset.
  useEffect(() => {
    if (!overlay) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [overlay]);

  function back() {
    // Came from inside the app: go back to it. Opened directly: go to Study.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(studyPath(file?.path.split("/").slice(0, -1).join("/")));
  }

  return (
    <div className={cn("flex flex-col bg-bg", overlay ? "h-full" : "h-dvh")}>
      <header className="z-20 shrink-0 border-b bg-bg pt-safe-t">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={back}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{title}</p>
            {file && (
              <p className="truncate text-[11px] font-medium text-muted">
                {prettyName(file.path.split("/").slice(0, -1).join(" / ")) || "Study"} · {formatSize(file.size)}
              </p>
            )}
          </div>
          <FindButton find={find} disabled={!finder} />
          {file && (saveable || download.data) ? (
            <SaveLink
              file={file}
              blob={saveable}
              href={download.data}
              // On a phone the label is hidden and only the icon shows.
              label="Download"
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-brand-ink"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </SaveLink>
          ) : (
            <span className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-bold text-muted opacity-60">
              <Download className="h-4 w-4" />
            </span>
          )}
        </div>
      </header>
      <FindBar find={find} />

      {file && renderable && data && shown?.kind === "html" ? (
        <HtmlView key={shown.key} blob={data} title={title} />
      ) : file && renderable && data && shown ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Everything that renders scrolls and zooms in one box below the
              header (see ZoomPane); the key starts each file at 1×. */}
        <ZoomPane
          key={shown.key}
          className="min-h-0 flex-1"
          mode={shown.kind === "pdf" ? "layout" : "transform"}
          // A PDF at most 1.5 px per point at 1×, like a PDF app's 100%+: fit to a MacBook's width, a phone-sized page (the study folder's own notes, 100 mm wide) came out 3.5× life size.
          maxWidth={shown.kind === "pdf" && pdfPoints ? Math.min(1024, Math.round(pdfPoints * PDF_PX_PER_POINT)) : undefined}
          label={pager && pager.total > 1 ? <PageCounter pager={pager} /> : undefined}
        >
          {({ width, scroller, content }) => (
            <Suspense fallback={<p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}>
              {shown.kind === "pdf" && (
                <PdfView
                  blob={data}
                  startPage={page}
                  width={width}
                  scroller={scroller}
                  content={content}
                  onFinder={onFinder}
                  onPageWidth={setPdfPoints}
                />
              )}
              {shown.kind === "docx" && <DocxView blob={data} />}
              {shown.kind === "sheet" && <SheetView blob={data} path={file.preview && viewerKind(file.path) === "convert" ? `x.${file.preview.ext}` : file.path} />}
              {(shown.kind === "code" || shown.kind === "text") && (
                <CodeView blob={data} language={shown.kind === "code" ? codeLanguage(file.path) : null} />
              )}
              {shown.kind === "image" && <ImageView blob={data} alt={title} />}
              {shown.kind !== "pdf" && <DomFind content={content} scroller={scroller} onFinder={onFinder} />}
              <DomPager scroller={scroller} content={content} selector={PAGES[shown.kind] ?? null} onPager={setPager} />
            </Suspense>
          )}
        </ZoomPane>
        <MatchRail find={find} />
        {/* What links to what you're looking at: a PDF's pages are the Mac's page numbers, a deck's too
            (its PDF); a board photo is one item. */}
        {shown.kind === "pdf" && pager && (
          <ConnectedLine course={courseOfPath(file.path)} ids={pageIds(file.path, pager.current)} className="shrink-0 border-t bg-bg px-3 py-2 pb-safe-b" />
        )}
        {shown.kind === "image" && (
          <ConnectedLine course={courseOfPath(file.path)} ids={[photoId(file.path)]} className="shrink-0 border-t bg-bg px-3 py-2 pb-safe-b" />
        )}
        </div>
      ) : (
        <main className="mx-auto w-full max-w-5xl min-h-0 flex-1 overflow-auto px-3 pt-3 sm:px-6">
          {manifest.isLoading && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
          {manifest.data && !file && <NoPreview message="This file isn't in your study folder any more." />}
          {file && !renderable && (
            <NoPreview
              message={
                shown?.kind === "convert"
                  ? "Your Mac converts this file at its next sync so it opens here. Until then, download it."
                  : "This kind of file can't be shown here. Download it to open it."
              }
              file={file}
              blob={saveable}
              href={download.data}
            />
          )}
          {file && renderable && blob.isLoading && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
          {file && renderable && blob.isError && (
            <NoPreview message="Couldn't load this file. Check your connection and try again." file={file} blob={saveable} href={download.data} />
          )}
        </main>
      )}
    </div>
  );
}

/** A note's web version (md2pdf.py's build_html), filling the space under the header and reflowing to it, with the page counter over it. */
function HtmlView({ blob, title }: { blob: Blob; title: string }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [pager, setPager] = useState<Pager | null>(null);
  useEffect(() => {
    let alive = true;
    void blob.text().then((t) => alive && setDoc(t.replace("<head>", '<head><base target="_blank">')));
    return () => {
      alive = false;
    };
  }, [blob]);
  // Counted in screenfuls of the note. Same-origin (scripts still off) so its scroll can be read.
  useEffect(() => {
    const win = frame?.contentWindow;
    const page = frame?.contentDocument?.scrollingElement as HTMLElement | null | undefined;
    if (!loaded || !win || !page) return;
    const goTo = (n: number) => goToPage(page, null, n);
    const stop = trackPages(page, null, (s) => setPager({ ...s, goTo }), { events: win });
    return () => {
      stop();
      setPager(null);
    };
  }, [frame, loaded]);
  if (doc == null) return <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <iframe
        ref={setFrame}
        title={title}
        srcDoc={doc}
        onLoad={() => setLoaded((n) => n + 1)}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="min-h-0 w-full flex-1 border-0 bg-[#0E1116]"
      />
      {pager && pager.total > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-safe-b">
          <div className="pointer-events-auto mb-4 flex items-center rounded-full border bg-surface/95 px-2 py-1.5 text-sm font-bold text-muted shadow-lg backdrop-blur-sm">
            <PageCounter pager={pager} />
          </div>
        </div>
      )}
    </div>
  );
}

function ImageView({ blob, alt }: { blob: Blob; alt: string }) {
  // The blob's link lives exactly as long as the <img> that shows it.
  const show = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(blob);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob]
  );
  return <img ref={show} alt={alt} className="mx-auto mb-16 h-auto max-w-full rounded-xl" />;
}

function NoPreview({ message, file, blob, href }: { message: string; file?: StudyFile; blob?: Blob | null; href?: string }) {
  return (
    <div className="card mx-auto mt-6 flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <FileQuestion className="h-8 w-8 text-muted" />
      <p className="text-sm font-medium text-muted">{message}</p>
      {file && (blob || href) && (
        <SaveLink file={file} blob={blob ?? null} href={href} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-ink">
          <Download className="h-4 w-4" /> Download {baseName(file.path)}
        </SaveLink>
      )}
    </div>
  );
}

/**
 * Download: the bytes, saved from the tap itself (the share sheet on an
 * iPhone, a named download elsewhere) when they're here; otherwise the
 * signed link, as before.
 */
function SaveLink({ file, blob, href, label, className, children }: {
  file: StudyFile;
  blob: Blob | null;
  href?: string;
  label?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href ?? "#"}
      aria-label={label}
      download={baseName(file.path)}
      className={className}
      onClick={(e) => {
        if (!blob) return; // let the signed link do it
        e.preventDefault();
        saveFile(blob, baseName(file.path));
      }}
    >
      {children}
    </a>
  );
}
