/**
 * The class recorder's slide alignment, measured (npm run recorder:eval,
 * scripts/recorder-eval.mjs). Until I may record a class, the lectures are
 * stand-ins: a walk through a real deck that the local model explains
 * slide by slide for about two minutes each, as a teacher would, with two
 * asides of about a minute off the slides, spoken by macOS's `say`. So the
 * slide behind every second is known. The real recorder then transcribes
 * the audio, picks its deck from the whole course and lines it up.
 */

export const LECTURES = [
  { id: "os-cpu-scheduling", course: "Operating_Systems", deck: "Operating_Systems/02_Notes/Unit_3/Unit3_CPU_Scheduling_Slides.pptx" },
  {
    id: "dsa-stacks-queues",
    course: "Data_Structures_and_Algorithms",
    deck: "Data_Structures_and_Algorithms/02_Notes/Unit_3/Unit3_Stacks_and_Queues_Slides_Deepajothi_(GradeX).pptx",
  },
  {
    id: "fds-pandas",
    course: "Fundamentals_of_Data_Science",
    deck: "Fundamentals_of_Data_Science/02_Notes/Unit_4/Unit4_Pandas_and_Handling_Large_Data_Slides_(revised_8Oct,_86_slides).pptx",
  },
];

export const SLIDES_PER_LECTURE = 8;

export const ASIDES = [
  [
    "Okay, before we go any further, a few things. The attendance sheet is going round now, so sign it and pass it to the back,",
    "and please don't sign for your friends, I do count heads at the end of the hour. Whoever has the duster, bring it up here, I can't write on half a board.",
    "The lab on Thursday is moved to the second floor this week, because the ground floor lab is being rewired, so go straight there and don't wait outside the old one.",
    "And the people at the back, I can hear you. If you're talking about the cricket match, you can tell me the score after class, not now.",
    "Also, some of you still haven't collected your corrected answer scripts from the first test. They are in the department office, collect them before Friday,",
    "because after that they go back to the exam cell and you won't see them again.",
  ].join(" "),
  [
    "Right, let me tell you about the assignment, since many of you have been asking. It is due on Friday, at the start of the class, and no, I won't take it late this time.",
    "Last time half the class submitted on Monday and that is not fair to the people who finished on time. Submit it on the portal, not on WhatsApp, not by email.",
    "Write your register number and your name on the first page, and number your pages, because last time I got loose sheets with no names on them.",
    "Handwritten is fine, but it has to be readable. If I cannot read it, I cannot give marks for it. You can work in pairs on the problems, but the write up is yours alone,",
    "and if two scripts look the same, both get zero. If you are stuck, come to my cabin on Wednesday after lunch, I will be there till four.",
  ].join(" "),
];

/** In the cached scripts' names: changing the prompt or the asides makes new ones. */
export const SCRIPT_VERSION = 2;

/** A slide worth a minute's explaining has at least this many letters. */
const MIN_LETTERS = 150;
const letters = (s) => (s.match(/\p{L}/gu) ?? []).length;

/** `n` slides spread evenly through the deck, in order, of those with enough to say. */
export function pickSlides(slides, n = SLIDES_PER_LECTURE) {
  const rich = slides.filter((s) => letters(s.text) >= MIN_LETTERS);
  if (rich.length <= n) return rich;
  return Array.from({ length: n }, (_, i) => rich[Math.round((i * (rich.length - 1)) / (n - 1))]);
}

export const explainSchema = { type: "object", properties: { said: { type: "string" } }, required: ["said"], additionalProperties: false };

export function explainPrompt(course, text) {
  return [
    `This is a slide from a ${course} lecture at SRM. Explain it to the class aloud, as the teacher, in 260 to 320 words:`,
    "in your own words, with an example or two, as a teacher who spends a couple of minutes on it. Don't read the slide's sentences out and don't say \"this slide\".",
    'It will be spoken, so no lists, symbols or formatting. Answer in JSON: { "said": "..." }.',
    "",
    `The slide: ${text}`,
  ].join("\n");
}

/** The lecture in order: each slide's explanation, with an aside after the third and the sixth. */
export function scriptOf(explained, asides = ASIDES) {
  const out = [];
  explained.forEach((e, i) => {
    out.push({ page: e.page, text: e.said });
    if (i === 2 && asides[0]) out.push({ page: null, text: asides[0] });
    if (i === 5 && asides[1]) out.push({ page: null, text: asides[1] });
  });
  return out;
}

/** The PCM samples of a 16-bit WAV: its data chunk. */
export function wavData(buf) {
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === "data") return buf.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in the WAV");
}

/** A 16 kHz mono 16-bit WAV of `pcm`. */
export function wavFile(pcm, rate = 16000) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** Pieces of PCM joined with `gap` seconds of silence, and when each was spoken: { pcm, timeline }. */
export function joinSpoken(pieces, { gap = 0.7, rate = 16000 } = {}) {
  const silence = Buffer.alloc(Math.round(gap * rate) * 2);
  const parts = [];
  const timeline = [];
  let bytes = 0;
  for (const p of pieces) {
    if (parts.length) {
      parts.push(silence);
      bytes += silence.length;
    }
    timeline.push({ page: p.page, start: bytes / 2 / rate, end: (bytes + p.pcm.length) / 2 / rate });
    parts.push(p.pcm);
    bytes += p.pcm.length;
  }
  return { pcm: Buffer.concat(parts), timeline };
}

/** What was on screen during [start, end): the piece of the timeline that covers most of it. */
export function truthAt(timeline, start, end) {
  let best = null;
  let most = 0;
  for (const t of timeline) {
    const overlap = Math.min(end, t.end) - Math.max(start, t.start);
    if (overlap > most) [best, most] = [t, overlap];
  }
  return best ? best.page : null;
}

/** Slides this alike are the same slide: a copy of a deck keeps its slides' text, and so their vectors. */
export const TWIN = 0.98;

/**
 * The pages of the chosen deck that show a slide of the right one: the
 * slide itself when it is the right deck, and its copies (at least TWIN
 * alike) when the chosen deck repeats it.
 */
export function twinsOf(trueSlides, chosenSlides, sameDeck) {
  const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  return (page) => {
    const slide = trueSlides.find((s) => s.page === page);
    const twins = slide ? chosenSlides.filter((c) => cos(c.vector, slide.vector) >= TWIN).map((c) => c.page) : [];
    return sameDeck && !twins.includes(page) ? [page, ...twins] : twins;
  };
}

/** The deck it chose: "right", a "copy" (most of the lecture's slides are in it), or "wrong". */
export function deckIs({ deck, chosen, timeline, twins }) {
  if (chosen === deck) return "right";
  const pages = [...new Set(timeline.map((t) => t.page).filter((p) => p !== null))];
  return chosen && pages.filter((p) => twins(p).length).length * 4 >= pages.length * 3 ? "copy" : "wrong";
}

/**
 * How the alignment did on one lecture. A moment on a slide is right when
 * the page it opens shows the slide on screen (`twins`); near when it is
 * within a page of one that does. An aside is kept off when its moment
 * gets no slide.
 */
export function scoreLecture({ moments, timeline, twins }) {
  const out = { moments: moments.length, onSlide: 0, right: 0, near: 0, dropped: 0, asides: 0, keptOff: 0 };
  for (const m of moments) {
    const truth = truthAt(timeline, m.start, m.end);
    if (truth === null) {
      out.asides++;
      if (m.page === null) out.keptOff++;
      continue;
    }
    out.onSlide++;
    const shown = twins(truth);
    if (m.page === null) out.dropped++;
    else if (shown.includes(m.page)) out.right++;
    if (m.page !== null && shown.some((p) => Math.abs(m.page - p) <= 1)) out.near++;
  }
  return out;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

/** A paragraph as lines of at most `width` characters. */
function wrap(text, width = 100) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}
const base = (p) => (p ? p.split("/").pop() : "none");

/** EVAL.md's section on the recorder, from each lecture's score. */
export function report({ results, date, floor, whisper, model }) {
  const total = results.reduce(
    (t, r) => ({ onSlide: t.onSlide + r.onSlide, right: t.right + r.right, near: t.near + r.near, dropped: t.dropped + r.dropped, asides: t.asides + r.asides, keptOff: t.keptOff + r.keptOff }),
    { onSlide: 0, right: 0, near: 0, dropped: 0, asides: 0, keptOff: 0 }
  );
  const decks = results.filter((r) => r.deckIs !== "wrong").length;
  const deckCell = (r) => (r.deckIs === "right" ? "the right one" : r.deckIs === "copy" ? `a copy of it: ${base(r.chosen)}` : `${base(r.chosen)} (wrong)`);
  const minutes = Math.round(results.reduce((n, r) => n + r.seconds, 0) / 60);
  return [
    "## Class recorder: lining lectures up with slides",
    "",
    ...wrap(
      `\`scripts/lib/lecture-align.mjs\` on ${results.length} stand-in lectures, ${minutes} minutes in all, run on ${date} with \`npm run recorder:eval\`. ` +
        `Each is a walk through ${SLIDES_PER_LECTURE} slides of a real deck from my study folder, each explained for about two minutes by ${model} as a teacher would, ` +
        "with two asides of about a minute off the slides, spoken by macOS's `say`. So the slide behind every second is known. " +
        `The recorder then ran as it does on a real lecture: ${whisper}, its deck chosen from every deck in the course, moments of about a minute lined up at a floor of ${floor}.`
    ),
    "",
    "| Lecture | Deck it chose | Moments on a slide | Right slide | Within a page | Given no slide | Aside moments kept off |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.id} | ${deckCell(r)} | ${r.onSlide} | ${pct(r.right, r.onSlide)} | ${pct(r.near, r.onSlide)} | ${pct(r.dropped, r.onSlide)} | ${r.keptOff} of ${r.asides} |`
    ),
    `| All | ${decks} of ${results.length} right or a copy | ${total.onSlide} | ${pct(total.right, total.onSlide)} | ${pct(total.near, total.onSlide)} | ${pct(total.dropped, total.onSlide)} | ${total.keptOff} of ${total.asides} |`,
    "",
    "- A moment's slide is the one on screen for most of its minute; one across a change of slide is often given the other.",
    `- Right slide means the page it opens shows the slide on screen: the slide itself, or its copy (at least ${TWIN} alike) when the deck chosen repeats the right one, as a faculty's full deck repeats a unit's.`,
    "- These are stand-ins. A real class has one voice with an accent, noise, board work, Hindi and long examples off the slides; three real lectures, checked by hand, are still to measure once I may record one.",
    "",
  ].join("\n");
}
