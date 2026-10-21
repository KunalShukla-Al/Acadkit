import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bmpAverage, buildRenditions, flattenTinyTiles, tidyBullets } from "./renditions.mjs";

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "renditions-test-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const doc = { path: "OS/old.doc", full: "/x/old.doc", key: "0404/blobs/aaa.doc", ext: "doc" };
const ppt = { path: "OS/old.ppt", full: "/x/old.ppt", key: "0404/blobs/bbb.ppt", ext: "ppt" };
const xls = { path: "OS/marks.xls", full: "/x/marks.xls", key: "0404/blobs/ddd.xls", ext: "xls" };
const pdf = { path: "OS/new.pdf", full: "/x/new.pdf", key: "0404/blobs/ccc.pdf", ext: "pdf" };
const pptx = { path: "OS/slides.pptx", full: "/x/slides.pptx", key: "0404/blobs/eee.pptx", ext: "pptx" };
const docx = { path: "OS/notes.docx", full: "/x/notes.docx", key: "0404/blobs/fff.docx", ext: "docx" };

/** A LibreOffice that writes `<name>.<to>` into --outdir. */
function fakeSoffice(calls: string[][]) {
  return async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    if (args[0] === "--headless") {
      const [, , to, , outdir, input] = args;
      await writeFile(path.join(outdir, `${path.basename(input).replace(/\.[^.]+$/, "")}.${to}`), "out");
    }
    return { stdout: "", stderr: "" };
  };
}

describe("buildRenditions", () => {
  it("converts .ppt to PDF and .xls to .xlsx with LibreOffice when it is there", async () => {
    const calls: string[][] = [];
    const run = fakeSoffice(calls);
    const out = await buildRenditions([ppt, xls], { run, cacheDir, log: () => {} });
    expect(out.get("OS/old.ppt")).toMatchObject({ ext: "pdf", full: path.join(cacheDir, "bbb.pdf") });
    expect(out.get("OS/marks.xls")).toMatchObject({ ext: "xlsx", full: path.join(cacheDir, "ddd.xlsx") });
    expect(calls.filter((c) => c[1] === "--headless").map((c) => c[3])).toEqual(["pdf", "xlsx"]);
    // In its own profile, so an open LibreOffice window can't take the job.
    expect(calls.find((c) => c[1] === "--headless")!.at(-1)).toMatch(/^-env:UserInstallation=file:\/\//);
  });

  it("makes a PDF of .pptx, .docx and .doc, laid out as Office would", async () => {
    const calls: string[][] = [];
    const out = await buildRenditions([pptx, docx, doc, pdf], { run: fakeSoffice(calls), cacheDir, log: () => {} });
    expect([...out.keys()]).toEqual(["OS/slides.pptx", "OS/notes.docx", "OS/old.doc"]);
    // A deck's cache name carries the tidying version, so new tidying converts it again.
    expect(out.get("OS/slides.pptx")).toMatchObject({ ext: "pdf", full: path.join(cacheDir, "eee.deck3.pdf") });
    expect(out.get("OS/notes.docx")).toMatchObject({ ext: "pdf", full: path.join(cacheDir, "fff.pdf") });
    expect(out.get("OS/old.doc")).toMatchObject({ ext: "pdf", full: path.join(cacheDir, "aaa.pdf") });
    // LibreOffice is looked for once, not per file.
    expect(calls.filter((c) => c[1] === "--version")).toHaveLength(1);
  });


  it("without LibreOffice, converts .doc with textutil into the cache, keyed by the source hash", async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (cmd === "textutil") await writeFile(args[3], "converted");
      else throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return { stdout: "", stderr: "" };
    };
    const logs: string[] = [];
    const out = await buildRenditions([doc, ppt, pdf], { run, cacheDir, log: (m: string) => logs.push(m) });
    expect(calls.find((c) => c[0] === "textutil")).toEqual(["textutil", "-convert", "docx", "-output", path.join(cacheDir, "aaa.docx"), "/x/old.doc"]);
    expect([...out.keys()]).toEqual(["OS/old.doc"]);
    expect(out.get("OS/old.doc")).toMatchObject({ ext: "docx", full: path.join(cacheDir, "aaa.docx") });
    expect(out.get("OS/old.doc")!.sha).toMatch(/^[0-9a-f]{64}$/);
    // No LibreOffice: the .ppt is left as a download, said once.
    expect(logs.some((l) => l.includes("LibreOffice"))).toBe(true);
  });

  it("converts nothing twice", async () => {
    await writeFile(path.join(cacheDir, "aaa.pdf"), "cached");
    let ran = 0;
    const out = await buildRenditions([doc], {
      run: async () => {
        ran++;
        return { stdout: "", stderr: "" };
      },
      cacheDir,
    });
    expect(ran).toBe(0);
    expect(out.has("OS/old.doc")).toBe(true);
  });

  it("leaves a file without a preview when conversion fails", async () => {
    const out = await buildRenditions([doc], {
      run: async () => {
        throw new Error("bad file");
      },
      cacheDir,
      log: () => {},
    });
    expect(out.size).toBe(0);
  });
});

describe("flattenTinyTiles", () => {
  const tiled = (id: string) =>
    `<p:bg><p:bgPr><a:blipFill rotWithShape="1"><a:blip r:embed="${id}"><a:alphaModFix/></a:blip><a:tile tx="0" ty="0" sx="65000" sy="65000" flip="none" algn="tl"/></a:blipFill></p:bgPr></p:bg>`;
  const rels = (pairs: [string, string][]) =>
    `<Relationships>${pairs.map(([id, t]) => `<Relationship Id="${id}" Type="image" Target="${t}"/>`).join("")}</Relationships>`;

  it("turns a tiny tiled texture into a solid fill of its average colour, and leaves a real one tiled", async () => {
    const masters = path.join(cacheDir, "ppt", "slideMasters");
    await mkdir(path.join(masters, "_rels"), { recursive: true });
    await writeFile(path.join(masters, "slideMaster1.xml"), `<p:sldMaster>${tiled("rId3")}${tiled("rId4")}</p:sldMaster>`);
    await writeFile(path.join(masters, "_rels", "slideMaster1.xml.rels"), rels([["rId3", "../media/noise.png"], ["rId4", "../media/drops.jpg"]]));
    const seen: string[] = [];
    const n = await flattenTinyTiles(cacheDir, {
      average: async (img: string) => {
        seen.push(path.basename(img));
        return img.endsWith("noise.png") ? { width: 5, height: 5, colour: [251, 251, 251] } : { width: 128, height: 128, colour: [174, 225, 234] };
      },
    });
    expect(n).toBe(1);
    expect(seen).toEqual(["noise.png", "drops.jpg"]);
    const xml = await readFile(path.join(masters, "slideMaster1.xml"), "utf8");
    expect(xml).toContain('<a:solidFill><a:srgbClr val="FBFBFB"/></a:solidFill>');
    expect(xml).toContain('r:embed="rId4"');
    expect(xml).not.toContain('r:embed="rId3"');
  });

  it("does nothing to a deck without tiles, or a folder that isn't one", async () => {
    const average = async () => ({ width: 1, height: 1, colour: [0, 0, 0] });
    expect(await flattenTinyTiles(path.join(cacheDir, "missing"), { average })).toBe(0);
    await mkdir(path.join(cacheDir, "ppt", "slides"), { recursive: true });
    await writeFile(path.join(cacheDir, "ppt", "slides", "slide1.xml"), "<p:sld><a:solidFill/></p:sld>");
    expect(await flattenTinyTiles(cacheDir, { average })).toBe(0);
  });
});

describe("bmpAverage", () => {
  /** A bottom-up 24-bit BMP of `px` ([r, g, b] per pixel), `w` wide. */
  function bmp24(w: number, px: number[][]) {
    const h = px.length / w;
    const stride = Math.ceil((w * 3) / 4) * 4;
    const buf = Buffer.alloc(54 + stride * h);
    buf.write("BM");
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(w, 18);
    buf.writeInt32LE(h, 22);
    buf.writeUInt16LE(24, 28);
    px.forEach(([r, g, b], k) => {
      const i = 54 + Math.floor(k / w) * stride + (k % w) * 3;
      [buf[i], buf[i + 1], buf[i + 2]] = [b, g, r];
    });
    return buf;
  }
  it("averages each channel, row padding and all", () => {
    expect(bmpAverage(bmp24(3, [[200, 0, 0], [100, 50, 0], [0, 100, 30], [100, 50, 30], [100, 50, 30], [100, 50, 30]]))).toEqual({
      width: 3,
      height: 2,
      colour: [100, 50, 20],
    });
  });
});

describe("tidyBullets", () => {
  it("takes the bullet off a line of nothing but spaces", () => {
    const blank = `<a:p><a:pPr marL="457200" indent="-342900"><a:buSzPts val="1800"/><a:buChar char="•"/><a:defRPr/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>\u00a0</a:t></a:r></a:p>`;
    const { xml, changed } = tidyBullets(blank);
    expect(changed).toBe(1);
    expect(xml).toBe(`<a:p><a:pPr marL="457200" indent="-342900"><a:buSzPts val="1800"/><a:buNone/><a:defRPr/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>\u00a0</a:t></a:r></a:p>`);
    expect(tidyBullets(`<a:p><a:pPr lvl="1"/><a:r><a:t>&#160;</a:t></a:r></a:p>`).xml).toBe(`<a:p><a:pPr lvl="1"><a:buNone/></a:pPr><a:r><a:t>&#160;</a:t></a:r></a:p>`);
    expect(tidyBullets(`<a:p><a:r><a:t> </a:t></a:r></a:p>`).xml).toBe(`<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t> </a:t></a:r></a:p>`);
  });

  it("starts a paragraph that opens with a line break on its bullet's line", () => {
    const { xml, changed } = tidyBullets(`<a:p><a:pPr/><a:br><a:rPr lang="en-US"/></a:br><a:r><a:t>plt.subplot(1, 2, 2)</a:t></a:r><a:br/><a:r><a:t>#second plot</a:t></a:r></a:p>`);
    expect(changed).toBe(1);
    expect(xml).toBe(`<a:p><a:pPr/><a:r><a:t>plt.subplot(1, 2, 2)</a:t></a:r><a:br/><a:r><a:t>#second plot</a:t></a:r></a:p>`);
    // As PowerPoint wrote it in the FDS deck: an empty run, then the break.
    const fds = `<a:p><a:r><a:rPr lang="en-GB" dirty="0"/><a:t/></a:r><a:br><a:rPr lang="en-GB" dirty="0"/></a:br><a:r><a:rPr lang="en-GB" b="0"/><a:t>plt.subplot</a:t></a:r></a:p>`;
    expect(tidyBullets(fds).xml).toBe(`<a:p><a:r><a:rPr lang="en-GB" b="0"/><a:t>plt.subplot</a:t></a:r></a:p>`);
  });

  it("leaves real lines, and empty ones PowerPoint already shows bare, alone", () => {
    for (const p of [
      `<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Real text</a:t></a:r></a:p>`,
      `<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:endParaRPr/></a:p>`,
      `<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t> </a:t></a:r></a:p>`,
    ])
      expect(tidyBullets(p)).toEqual({ xml: p, changed: 0 });
  });
});
