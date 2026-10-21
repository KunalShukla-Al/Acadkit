import { describe, expect, it } from "vitest";
import { looseSubject, normalise, parseAsk } from "./ask.ts";

const SUBJECTS = [
  { code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" },
  { code: "21CSS202T", name: "Fundamentals of Data Science", short_name: "FDS" },
];
const ask = (t: string) => parseAsk(t, SUBJECTS);

describe("parseAsk", () => {
  it("hears the four questions", () => {
    expect(ask("Can I skip OS today?")).toMatchObject({ kind: "skip", subject: "21CSC202J" });
    expect(ask("What do I need in DSA")).toMatchObject({ kind: "need", subject: "21CSC201J", grade: null });
    expect(ask("When is my next test")).toMatchObject({ kind: "next-test", subject: null });
    expect(ask("I'm absent in OS")).toMatchObject({ kind: "absent", subject: "21CSC202J", day: 0 });
  });

  it("tells asking about skipping from saying you're away", () => {
    expect(ask("Should I bunk FDS").kind).toBe("skip");
    expect(ask("I'm skipping FDS").kind).toBe("absent");
    expect(ask("Mark me absent for DSA yesterday")).toMatchObject({ kind: "absent", day: -1 });
  });

  it("reads the grade a 'need' question names", () => {
    expect(ask("How much do I need for an A plus in OS").grade).toBe("A+");
    expect(ask("what do I need to get an O in DSA").grade).toBe("O");
    expect(ask("what do i need for a C in OS").grade).toBe("C");
    expect(ask("need for an A in OS").grade).toBe("A");
    expect(ask("marks needed for B plus in OS").grade).toBe("B+");
  });

  it("reads Hinglish's kal (yesterday or tomorrow) by its tense, and never marks a future absence", () => {
    expect(ask("kal OS nahi gaya")).toMatchObject({ kind: "absent", day: -1 });
    expect(ask("aaj OS nahi ja raha")).toMatchObject({ kind: "absent", day: 0 });
    expect(ask("kal OS nahi jaunga").kind).not.toBe("absent");
  });

  it("says when it can't place a question", () => {
    expect(ask("play some music").kind).toBe("unknown");
  });

  it("normalises what dictation gives", () => {
    expect(normalise("  Can I  skip   O.S.?! ")).toBe("can i skip o s");
    expect(normalise("I’m absent")).toBe("i'm absent");
  });
});

describe("looseSubject", () => {
  const MORE = [
    ...SUBJECTS,
    { code: "21MAB201T", name: "Transforms and Boundary Value Problems", short_name: null },
    { code: "21CSC206P", name: "Advanced Object Oriented Programming", short_name: "AOOP" },
    { code: "21LEM201T", name: "Professional Ethics", short_name: null },
  ];
  const find = (t: string) => looseSubject(normalise(t), MORE);

  it("takes the start of a name's words, singular or plural", () => {
    expect(find("can i skip operating")).toBe("21CSC202J");
    expect(find("operating system attendance")).toBe("21CSC202J");
    expect(find("data structures next test")).toBe("21CSC201J");
    expect(find("absent in ethics")).toBe("21LEM201T");
  });

  it("knows a name's initials when none was typed, and what students call courses", () => {
    expect(find("tbvp test")).toBe("21MAB201T");
    expect(find("what do i need in maths")).toBe("21MAB201T");
    expect(find("java lab")).toBe("21CSC206P");
  });

  it("names nothing on a tie or a near miss", () => {
    // "data" begins both Data Structures and Data Science.
    expect(find("data")).toBeNull();
    expect(find("data science")).toBe("21CSS202T");
    expect(find("what is the weather")).toBeNull();
  });

  it("hears the lab", () => {
    expect(parseAsk("I'm absent in DSA lab", MORE)).toMatchObject({ kind: "absent", subject: "21CSC201J", session: "lab" });
    expect(parseAsk("absent for OS theory", MORE).session).toBe("theory");
    expect(parseAsk("absent for OS", MORE).session).toBeNull();
  });
});

