import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acadkitShortcut, alarmShortcut, feedLinks, focusShortcut, leaveShortcut, NAMES, screenshotShortcut, syncShortcuts } from "./shortcuts.mjs";

type Params = Record<string, unknown>;
const TOKEN = "f".repeat(48);
const LINKS = feedLinks("https://ref.supabase.co/", TOKEN);
const URL = LINKS.today;
const ids = (w: { WFWorkflowActions: { WFWorkflowActionIdentifier: string }[] }) => w.WFWorkflowActions.map((a) => a.WFWorkflowActionIdentifier.replace("is.workflow.actions.", ""));
const params = (w: { WFWorkflowActions: { WFWorkflowActionParameters: Params }[] }, i: number) => w.WFWorkflowActions[i].WFWorkflowActionParameters;

describe("the Shortcuts", () => {
  it("name every action in full, as iOS looks them up: Shortcuts' own under is.workflow.actions, an app's by its intent", () => {
    for (const w of [alarmShortcut(URL), focusShortcut(URL), leaveShortcut(LINKS), acadkitShortcut(LINKS), screenshotShortcut(LINKS)])
      for (const a of w.WFWorkflowActions) expect(a.WFWorkflowActionIdentifier).toMatch(/^(is\.workflow\.actions\.[a-z.]+|com\.apple\.[\w.-]+)$/);
    expect(focusShortcut(URL).WFWorkflowActions.map((a) => a.WFWorkflowActionIdentifier)).toContain("is.workflow.actions.dnd.set");
    expect(acadkitShortcut(LINKS).WFWorkflowActions.map((a) => a.WFWorkflowActionIdentifier)).toContain("is.workflow.actions.repeat.each");
  });

  it("call the account's today feed", () => {
    expect(URL).toBe(`https://ref.supabase.co/functions/v1/feeds/today?token=${TOKEN}`);
    expect(params(alarmShortcut(URL), 0).WFURL).toBe(URL);
    expect(params(focusShortcut(URL), 0).WFURL).toBe(URL);
  });

  it("Alarm: reads `alarm`, and sets the alarm only when there is one", () => {
    const w = alarmShortcut(URL);
    expect(ids(w)).toEqual(["downloadurl", "getvalueforkey", "conditional", "com.apple.mobiletimer-framework.MobileTimerIntents.MTCreateAlarmIntent", "conditional"]);
    const fetched = params(w, 0).UUID;
    const value = params(w, 1);
    expect(value).toMatchObject({ WFDictionaryKey: "alarm", WFInput: { Value: { OutputUUID: fetched, Type: "ActionOutput" } } });
    // The If and its End If are one group, testing the value just read.
    expect(params(w, 2)).toMatchObject({ WFControlFlowMode: 0, WFCondition: 100, WFInput: { Variable: { Value: { OutputUUID: value.UUID } } } });
    expect(params(w, 4)).toEqual({ GroupingIdentifier: params(w, 2).GroupingIdentifier, WFControlFlowMode: 2 });
    expect(params(w, 3).dateComponents).toMatchObject({ Value: { string: "￼", attachmentsByRange: { "{0, 1}": { OutputUUID: value.UUID } } } });
  });

  it("Focus: Do Not Disturb until `focusUntil`, then the day from where you stand", () => {
    const w = focusShortcut(URL);
    expect(ids(w)).toEqual(["downloadurl", "getvalueforkey", "getvalueforkey", "conditional", "dnd.set", "conditional", "notification"]);
    expect(params(w, 1).WFDictionaryKey).toBe("focusUntil");
    expect(params(w, 2).WFDictionaryKey).toBe("arrive");
    expect(params(w, 4)).toMatchObject({ Enabled: 1, AssertionType: "Time", FocusModes: { Identifier: "com.apple.donotdisturb.mode.default" } });
    expect(params(w, 6).WFNotificationActionBody).toMatchObject({ Value: { attachmentsByRange: { "{0, 1}": { OutputUUID: params(w, 2).UUID } } } });
  });

  it("AcadKit: in the share sheet, sends each shared item to the share feed by name", () => {
    const w = acadkitShortcut(LINKS);
    expect(w.WFWorkflowTypes).toEqual(["ActionExtension"]);
    expect(w.WFWorkflowInputContentItemClasses).toEqual(expect.arrayContaining(["WFImageContentItem", "WFPDFContentItem", "WFGenericFileContentItem"]));
    expect(w.WFWorkflowHasShortcutInputVariables).toBe(true);
    expect(ids(w)).toEqual([
      "conditional", "repeat.each", "getitemname", "urlencode", "downloadurl", "repeat.each", "notification",
      "conditional", "dictatetext", "urlencode", "downloadurl", "getvalueforkey", "speaktext", "conditional",
    ]);
    expect(params(w, 1).WFInput).toEqual({ Value: { Type: "ExtensionInput" }, WFSerializationType: "WFTextTokenAttachment" });
    expect(params(w, 5)).toMatchObject({ GroupingIdentifier: params(w, 1).GroupingIdentifier, WFControlFlowMode: 2 });
    const send = params(w, 4);
    expect(send).toMatchObject({ WFHTTPMethod: "POST", WFHTTPBodyType: "File", WFRequestVariable: { Value: { VariableName: "Repeat Item" } } });
    // The URL is the share link, then the encoded name, attached at its UTF-16 offset.
    const url = (send.WFURL as { Value: { string: string; attachmentsByRange: Record<string, { OutputUUID: string }> } }).Value;
    expect(url.string).toBe(`${LINKS.share}&name=\uFFFC`);
    expect(url.attachmentsByRange[`{${LINKS.share.length + 6}, 1}`].OutputUUID).toBe(params(w, 3).UUID);
  });

  it("AcadKit with nothing shared: listens, asks, and speaks the answer", () => {
    const w = acadkitShortcut(LINKS);
    // If / Otherwise / End If, one group.
    expect([params(w, 0), params(w, 7), params(w, 13)].map((p) => [p.GroupingIdentifier, p.WFControlFlowMode])).toEqual([
      [params(w, 0).GroupingIdentifier, 0],
      [params(w, 0).GroupingIdentifier, 1],
      [params(w, 0).GroupingIdentifier, 2],
    ]);
    const url = (params(w, 10).WFURL as { Value: { string: string; attachmentsByRange: Record<string, { OutputUUID: string }> } }).Value;
    expect(url.string).toBe(`${LINKS.ask}&q=\uFFFC`);
    expect(Object.values(url.attachmentsByRange)[0].OutputUUID).toBe(params(w, 9).UUID);
    expect(params(w, 11)).toMatchObject({ WFDictionaryKey: "say", WFInput: { Value: { OutputUUID: params(w, 10).UUID } } });
    expect(params(w, 12).WFText).toMatchObject({ Value: { attachmentsByRange: { "{0, 1}": { OutputUUID: params(w, 11).UUID } } } });
  });

  it("Screenshot: sends the latest screenshot to the share feed under its own name", () => {
    const w = screenshotShortcut(LINKS);
    expect(ids(w)).toEqual(["getlastscreenshot", "getitemname", "urlencode", "downloadurl", "notification"]);
    const shot = params(w, 0);
    expect(shot.WFGetLatestPhotoCount).toBe(1);
    expect(params(w, 1).WFInput).toMatchObject({ Value: { OutputUUID: shot.UUID, OutputName: "Latest Screenshots" } });
    const send = params(w, 3);
    expect(send).toMatchObject({ WFHTTPMethod: "POST", WFHTTPBodyType: "File", WFRequestVariable: { Value: { OutputUUID: shot.UUID } } });
    expect(send.WFURL).toMatchObject({ Value: { string: `${LINKS.share}&name=￼` } });
  });

  it("Leave: asks first, and marks the rest absent only on OK", () => {
    const w = leaveShortcut(LINKS);
    expect(ids(w)).toEqual(["downloadurl", "getvalueforkey", "conditional", "alert", "downloadurl", "getvalueforkey", "notification", "conditional"]);
    expect(params(w, 1).WFDictionaryKey).toBe("leave");
    expect(params(w, 3)).toMatchObject({ WFAlertActionCancelButtonShown: true });
    expect(params(w, 4)).toMatchObject({ WFURL: LINKS.leave, WFHTTPMethod: "POST" });
  });

  it("are the same file for the same token", () => {
    expect(JSON.stringify(alarmShortcut(URL))).toBe(JSON.stringify(alarmShortcut(URL)));
    expect(JSON.stringify(acadkitShortcut(LINKS))).toBe(JSON.stringify(acadkitShortcut(LINKS)));
  });
});

describe("syncShortcuts", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shortcuts-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function world(token: string | null, tokenError: string | null = null) {
    const stored = new Map<string, unknown>();
    const removed: string[][] = [];
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: token ? { token } : null, error: tokenError ? { message: tokenError } : null }) }) }) }),
      storage: {
        from: () => ({
          upload: async (key: string, bytes: unknown) => (stored.set(key, bytes), { error: null }),
          remove: async (keys: string[]) => (removed.push(keys), { error: null }),
        }),
      },
    };
    return { supabase, stored, removed };
  }
  const made: string[] = [];
  const make = async (w: { WFWorkflowActions: { WFWorkflowActionParameters: Params }[] }) => (made.push(String(w.WFWorkflowActions[0].WFWorkflowActionParameters.WFURL)), Buffer.from("signed"));
  const opts = (supabase: unknown) => ({ supabase, pin: "0404", supabaseUrl: "https://ref.supabase.co", state: path.join(dir, "state"), make, log: () => {} });

  it("builds each one for a new token, once", async () => {
    const w = world(TOKEN);
    expect(await syncShortcuts(opts(w.supabase))).toBe("built");
    expect([...w.stored.keys()]).toEqual(NAMES.map((n) => `0404/shortcuts/${n}.shortcut`));
    expect(await syncShortcuts(opts(w.supabase))).toBeNull();
    expect(made).toHaveLength(NAMES.length);
  });

  it("builds them again when what they hold changes, though the token didn't", async () => {
    // What a Mac kept before the print covered the Shortcuts' contents: the token's alone.
    await writeFile(path.join(dir, "state"), createHash("sha256").update(TOKEN).digest("hex"));
    expect(await syncShortcuts(opts(world(TOKEN).supabase))).toBe("built");
  });

  it("takes them down once the token is revoked", async () => {
    await syncShortcuts(opts(world(TOKEN).supabase));
    const w = world(null);
    expect(await syncShortcuts(opts(w.supabase))).toBe("removed");
    expect(w.removed).toEqual([NAMES.map((n) => `0404/shortcuts/${n}.shortcut`)]);
    expect(await readFile(path.join(dir, "state"), "utf8")).toBe("none");
  });

  it("tries again next time when signing fails", async () => {
    const w = world(TOKEN);
    await expect(syncShortcuts({ ...opts(w.supabase), make: async () => Promise.reject(new Error("NSURLErrorDomain error 500")) })).rejects.toThrow(/500/);
    await expect(readFile(path.join(dir, "state"), "utf8")).rejects.toThrow();
  });

  it("waits quietly for migration 047", async () => {
    expect(await syncShortcuts(opts(world(null, 'relation "public.feed_tokens" does not exist').supabase))).toBeNull();
  });
});
