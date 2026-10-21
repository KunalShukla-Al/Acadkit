import { describe, expect, it } from "vitest";
import { IDLE_HOME_MS, shouldGoHome } from "@/hooks/useIdleHome";

describe("shouldGoHome", () => {
  it("goes Home after the app sat in the background long enough", () => {
    expect(shouldGoHome(0, IDLE_HOME_MS, "/marks")).toBe(true);
    expect(shouldGoHome(0, 10 * 60_000, "/view")).toBe(true);
  });

  it("keeps your place after a short trip away", () => {
    expect(shouldGoHome(0, IDLE_HOME_MS - 1, "/marks")).toBe(false);
  });

  it("does nothing on Today, or when the app was never hidden", () => {
    expect(shouldGoHome(0, IDLE_HOME_MS * 2, "/")).toBe(false);
    expect(shouldGoHome(null, IDLE_HOME_MS * 2, "/marks")).toBe(false);
  });

  it("waits two and a half minutes", () => {
    expect(IDLE_HOME_MS).toBe(150_000);
  });
});
