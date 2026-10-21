/**
 * An explainer saved as a video (src/components/explainer/player.tsx): the
 * scene and its step's sentence drawn onto a canvas, frame by frame, while
 * it plays, and recorded with MediaRecorder. Silent: the browser's speech
 * can't be recorded, so the sentence is always drawn in, as a caption.
 */

/** The video's frame: the 16:9 stage, and a strip under it for the caption. */
export const VIDEO = { width: 1280, height: 720, strip: 180 } as const;
const FPS = 24;

/** The recording format this browser has: MP4 where it can (Safari, recent Chrome), else WebM. */
export function videoType(isSupported: (t: string) => boolean): { mime: string; ext: "mp4" | "webm" } | null {
  for (const mime of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (isSupported(mime)) return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  return null;
}

/** Words in lines no wider than `width`, as `measure` sizes them. */
export function wrapWords(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > width) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}

const COPIED = ["fill", "stroke", "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-weight", "font-family", "text-anchor"] as const;

/**
 * The scene's SVG as markup an image can draw: each shape with its
 * computed colours and fonts written on it, since the app's classes and
 * colour tokens don't travel into an image, and its inline style kept.
 */
export function standaloneSvg(svg: SVGSVGElement, width: number, height: number): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")];
  const to = [copy, ...copy.querySelectorAll("*")];
  from.forEach((el, i) => {
    const style = getComputedStyle(el);
    const target = to[i] as Element;
    for (const p of COPIED) {
      const v = style.getPropertyValue(p);
      if (v) target.setAttribute(p, v);
    }
    // Motion's live positions and fades are inline styles: they stay.
    target.removeAttribute("class");
  });
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(copy);
}

function load(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error("couldn't draw the scene")));
    img.src = url;
  });
}

/**
 * Records `svg` while the explainer plays, until `done()` says it has
 * ended: the scene and `caption()` (the step's sentence) on each frame.
 * `colors` are the stage's background and the caption's ink.
 */
export async function recordExplainer({
  svg,
  caption,
  done,
  colors,
  type,
}: {
  svg: SVGSVGElement;
  caption: () => string;
  done: () => boolean;
  colors: { stage: string; ink: string; font: string };
  type: { mime: string };
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO.width;
  canvas.height = VIDEO.height + VIDEO.strip;
  const ctx = canvas.getContext("2d")!;
  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType: type.mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<Blob>((resolve) => (recorder.onstop = () => resolve(new Blob(chunks, { type: type.mime }))));
  recorder.start(250);

  const font = `600 40px ${colors.font}`;
  while (!done()) {
    const frame = await load(standaloneSvg(svg, VIDEO.width, VIDEO.height)).catch(() => null);
    ctx.fillStyle = colors.stage;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (frame) ctx.drawImage(frame, 0, 0, VIDEO.width, VIDEO.height);
    ctx.font = font;
    ctx.fillStyle = colors.ink;
    ctx.textAlign = "center";
    const lines = wrapWords(caption(), VIDEO.width - 160, (s) => ctx.measureText(s).width).slice(0, 3);
    lines.forEach((l, i) => ctx.fillText(l, VIDEO.width / 2, VIDEO.height + 50 + i * 50));
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  recorder.stop();
  return stopped;
}
