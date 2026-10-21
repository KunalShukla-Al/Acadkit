import { describe, expect, it } from "vitest";
import { pickVoice } from "@/lib/speech";

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService });

describe("the explainers' voice", () => {
  it("speaks with a voice on the device, Indian English first", () => {
    const voices = [voice("Samantha", "en-US"), voice("Google UK", "en-GB", false), voice("Rishi", "en-IN"), voice("Amélie", "fr-CA")];
    expect(pickVoice(voices)?.name).toBe("Rishi");
    expect(pickVoice(voices.filter((v) => v.name !== "Rishi"))?.name).toBe("Samantha");
  });

  it("takes a network voice only without a local one, and none without English", () => {
    expect(pickVoice([voice("Google UK", "en-GB", false), voice("Amélie", "fr-CA")])?.name).toBe("Google UK");
    expect(pickVoice([voice("Amélie", "fr-CA")])).toBeNull();
  });
});
