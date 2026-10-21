/**
 * The grammar against 60 phrasings of the four questions, the way a student
 * says them to Siri: short, half-formed, in Indian English, a few in Hinglish,
 * with dictation's spellings. Each row is [what was said, kind, subject's
 * short name or null, and for "absent" the day].
 */
import { describe, expect, it } from "vitest";
import { parseAsk, type AskKind } from "./ask.ts";

const SUBJECTS = [
  { code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" },
  { code: "21CSS202T", name: "Fundamentals of Data Science", short_name: "FDS" },
  { code: "21MAB201T", name: "Transforms and Boundary Value Problems", short_name: null },
  { code: "21CSC206P", name: "Advanced Object Oriented Programming", short_name: "AOOP" },
  { code: "21LEM201T", name: "Professional Ethics", short_name: null },
];
const CODE: Record<string, string> = { OS: "21CSC202J", DSA: "21CSC201J", FDS: "21CSS202T", TBVP: "21MAB201T", AOOP: "21CSC206P", ETH: "21LEM201T" };

const PHRASINGS: [string, AskKind, string | null, (0 | -1)?][] = [
  // can I skip
  ["Can I skip OS today", "skip", "OS"],
  ["can i bunk dsa", "skip", "DSA"],
  ["Should I skip FDS", "skip", "FDS"],
  ["How many classes can I miss in operating systems", "skip", "OS"],
  ["how many OS classes can I bunk", "skip", "OS"],
  ["Is it OK to skip maths tomorrow", "skip", "TBVP"],
  ["can I leave AOOP early", "skip", "AOOP"],
  ["What's my attendance in DSA", "skip", "DSA"],
  ["attendance in data science", "skip", "FDS"],
  ["how is my OS attendance", "skip", "OS"],
  ["Can I miss ethics", "skip", "ETH"],
  ["am I allowed to skip TBVP", "skip", "TBVP"],
  ["can i skip today", "skip", null],
  ["How many classes can I skip", "skip", null],
  ["OS mein kitna attendance hai", "skip", "OS"],
  // what do I need
  ["What do I need in OS", "need", "OS"],
  ["what do i need to pass dsa", "need", "DSA"],
  ["How much do I need for an A in FDS", "need", "FDS"],
  ["how many marks do I need in maths", "need", "TBVP"],
  ["What do I need to score in the end sem for OS", "need", "OS"],
  ["what marks do I need for an O in data structures", "need", "DSA"],
  ["how much should I score in AOOP", "need", "AOOP"],
  ["marks needed for B plus in ethics", "need", "ETH"],
  ["What do I need to get an A plus", "need", null],
  ["how much do i have to get in tbvp", "need", "TBVP"],
  ["minimum marks required in OS end sem", "need", "OS"],
  ["DSA mein kitne marks chahiye", "need", "DSA"],
  // next test
  ["When is my next test", "next-test", null],
  ["whens the next OS test", "next-test", "OS"],
  ["What's my next exam", "next-test", null],
  ["next DSA CT", "next-test", "DSA"],
  ["when is the FDS FT", "next-test", "FDS"],
  ["Any tests coming up", "next-test", null],
  ["next maths quiz", "next-test", "TBVP"],
  ["when's my next cycle test in operating systems", "next-test", "OS"],
  ["What tests do I have this week", "next-test", null],
  ["is there a test tomorrow", "next-test", null],
  ["AOOP lab test kab hai", "next-test", "AOOP"],
  ["agla test kab hai", "next-test", null],
  ["When is the TBVP end sem", "next-test", "TBVP"],
  // I'm absent
  ["I'm absent in OS", "absent", "OS", 0],
  ["Mark me absent for DSA", "absent", "DSA", 0],
  ["I missed FDS today", "absent", "FDS", 0],
  ["i skipped maths", "absent", "TBVP", 0],
  ["I bunked ethics yesterday", "absent", "ETH", -1],
  ["I was absent in AOOP yesterday", "absent", "AOOP", -1],
  ["im not in OS today", "absent", "OS", 0],
  ["I'm not coming to DSA lab", "absent", "DSA", 0],
  ["mark me absent", "absent", null, 0],
  ["I am absent today", "absent", null, 0],
  ["I'm skipping data science", "absent", "FDS", 0],
  ["absent for operating systems", "absent", "OS", 0],
  ["I'll be absent in TBVP", "absent", "TBVP", 0],
  ["missed the OS class", "absent", "OS", 0],
  ["aaj OS mein nahi gaya", "absent", "OS", 0],
  // none of the four
  ["what's the weather", "unknown", null],
  ["play my study playlist", "unknown", null],
  ["hello", "unknown", null],
  ["open the PDF", "unknown", null],
  ["set a timer for 25 minutes", "unknown", null],
];

describe("60 real phrasings", () => {
  it("has 60", () => expect(PHRASINGS).toHaveLength(60));

  for (const [said, kind, short, day] of PHRASINGS) {
    it(said, () => {
      const got = parseAsk(said, SUBJECTS);
      expect([got.kind, got.subject]).toEqual([kind, short ? CODE[short] : null]);
      if (day !== undefined) expect(got.day).toBe(day);
    });
  }
});
