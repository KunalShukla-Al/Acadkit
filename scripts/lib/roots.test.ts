import { describe, expect, it } from "vitest";
import { placeOf, studyRoots } from "./roots.mjs";

describe("studyRoots", () => {
  it("is STUDY_DIR alone by default", () => {
    expect(studyRoots({}, "/h")).toEqual({ dir: "/h/Documents/SRM_Sem3", extras: [] });
  });
  it("adds the next semester's folder under its own name", () => {
    expect(studyRoots({ STUDY_DIR: "~/Documents/SRM_Sem3", STUDY_NEXT_DIR: "~/Documents/SRM_Sem4 " }, "/h")).toEqual({
      dir: "/h/Documents/SRM_Sem3",
      extras: [{ prefix: "SRM_Sem4", dir: "/h/Documents/SRM_Sem4" }],
    });
  });
  it("drops it once it is the study folder (after a semester switch)", () => {
    expect(studyRoots({ STUDY_DIR: "~/Documents/SRM_Sem4", STUDY_NEXT_DIR: "/h/Documents/SRM_Sem4/" }, "/h").extras).toEqual([]);
  });
});

describe("placeOf", () => {
  const extras = [{ prefix: "SRM_Sem4", dir: "/h/Documents/SRM_Sem4" }];
  it("sends a next-semester path to that folder", () => {
    expect(placeOf("SRM_Sem4/Artificial_Intelligence/a.pdf", "/h/Documents/SRM_Sem3", extras)).toEqual({
      dir: "/h/Documents/SRM_Sem4",
      rel: "Artificial_Intelligence/a.pdf",
    });
  });
  it("leaves everything else in the study folder", () => {
    for (const rel of ["Operating_Systems/a.pdf", "SRM_Sem4.pdf", "SRM_Sem40/a.pdf"])
      expect(placeOf(rel, "/h/Documents/SRM_Sem3", extras)).toEqual({ dir: "/h/Documents/SRM_Sem3", rel });
  });
});
