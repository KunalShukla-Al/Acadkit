/**
 * The iPhone's Day Order Shortcuts, built and signed on this Mac for the
 * account's feed token (migration 047) and put where Settings offers them,
 * <pin>/shortcuts/<name>.shortcut:
 *
 *   AcadKit Alarm   reads today's feed and, on a day with classes, sets an
 *                   alarm an hour before the first. Run it from a daily
 *                   personal automation, early (5:00 AM).
 *   AcadKit Focus   reads the feed, turns Do Not Disturb on until the last
 *                   class ends (not once they're over), and says the day
 *                   from where you stand: the class on now, or the next.
 *                   Run it from an automation on any alarm being stopped
 *                   (the alarm is a new one each day, so it can't be picked),
 *                   and one on arriving at SRM.
 *   AcadKit Leave   on leaving SRM: if classes are still to come today, asks
 *                   "Mark the rest absent?" and, on OK, has the feeds mark
 *                   them (Today can undo it).
 *   AcadKit         in the share sheet: sends what is shared (photos, PDFs,
 *                   files) to the study folder's Inbox, through the feeds'
 *                   share endpoint. Run with nothing shared ("Hey Siri,
 *                   AcadKit"), it listens, asks the feeds' ask endpoint,
 *                   and speaks the answer.
 *   AcadKit Screenshot  sends the latest screenshot the same way. Set it on
 *                   Back Tap (Settings → Accessibility → Touch), so a double
 *                   tap on the back of the phone sends what's on screen: a
 *                   portal page is read into the app (scripts/lib/portal-shot.mjs).
 *
 * The calendar is the feed's webcal subscription, which Settings adds. A
 * Shortcut is a plist of actions, written here the way Cherri writes them
 * (github.com/electrikmilk/cherri), then signed with `shortcuts sign` so an
 * iPhone will import it. Automations can't travel in a file, so Settings
 * says how to set the two up.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const BUCKET = "study-files";
export const STATE = path.join(homedir(), "Library", "Application Support", "AcadKit", "shortcuts-token");

/** A stable UUID for a name, so the same token builds the same file. */
function uuid(name) {
  const h = createHash("sha1").update(`acadkit-shortcut:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

const action = (identifier, params = {}) => ({
  WFWorkflowActionIdentifier: identifier.includes(".") && !identifier.startsWith("is.") ? identifier : `is.workflow.actions.${identifier}`,
  WFWorkflowActionParameters: params,
});

/** An earlier action's output, as an action's whole input. */
const output = (id, name) => ({ Value: { OutputUUID: id, OutputName: name, Type: "ActionOutput" }, WFSerializationType: "WFTextTokenAttachment" });

/** The Shortcut's input (the share sheet's items) and the current item of a Repeat with Each. */
const INPUT = { Type: "ExtensionInput" };
const REPEAT_ITEM = { VariableName: "Repeat Item", Type: "Variable" };
const ref = (id, name) => ({ OutputUUID: id, OutputName: name, Type: "ActionOutput" });
const attach = (value) => ({ Value: value, WFSerializationType: "WFTextTokenAttachment" });

/**
 * Text built from strings and references (`ref`, INPUT, REPEAT_ITEM). Each
 * reference is a U+FFFC in the string, placed by its UTF-16 offset.
 */
function text(...parts) {
  let string = "";
  const attachmentsByRange = {};
  for (const p of parts) {
    if (typeof p === "string") string += p;
    else {
      attachmentsByRange[`{${string.length}, 1}`] = p;
      string += "\uFFFC";
    }
  }
  return { Value: { string, attachmentsByRange }, WFSerializationType: "WFTextTokenString" };
}

/** Text that is one earlier action's output. */
const textOf = (id, name) => text(ref(id, name));

/** Get today's feed, then one value from it: [actions, the value's UUID]. */
function feedValue(feedUrl, key) {
  const fetched = uuid(`${key}:fetch`);
  const value = uuid(`${key}:value`);
  return [
    [
      action("downloadurl", { WFURL: feedUrl, UUID: fetched }),
      action("getvalueforkey", { WFInput: output(fetched, "Contents of URL"), WFDictionaryKey: key, UUID: value }),
    ],
    value,
  ];
}

/** `body` only when `id`'s value is there (Has Any Value). */
function ifPresent(id, body) {
  const group = uuid(`if:${id}`);
  return [
    action("conditional", {
      GroupingIdentifier: group,
      WFControlFlowMode: 0,
      WFCondition: 100,
      WFInput: { Type: "Variable", Variable: output(id, "Dictionary Value") },
    }),
    ...body,
    action("conditional", { GroupingIdentifier: group, WFControlFlowMode: 2 }),
  ];
}

function workflow(actions, glyph, color, { types = [], inputs = [] } = {}) {
  return {
    WFWorkflowActions: actions,
    WFWorkflowClientVersion: "2607.0.2",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowIcon: { WFWorkflowIconGlyphNumber: glyph, WFWorkflowIconStartColor: color },
    WFWorkflowImportQuestions: [],
    WFWorkflowTypes: types,
    WFWorkflowInputContentItemClasses: inputs,
    WFWorkflowHasShortcutInputVariables: inputs.length > 0,
  };
}

/** AcadKit Alarm: see the top of the file. */
export function alarmShortcut(feedUrl) {
  const [get, alarm] = feedValue(feedUrl, "alarm");
  return workflow(
    [
      ...get,
      ...ifPresent(alarm, [
        action("com.apple.mobiletimer-framework.MobileTimerIntents.MTCreateAlarmIntent", {
          name: "AcadKit · first class",
          dateComponents: textOf(alarm, "Dictionary Value"),
          allowsSnooze: true,
          AppIntentDescriptor: { TeamIdentifier: "0000000000", BundleIdentifier: "com.apple.clock", Name: "Clock", AppIntentIdentifier: "CreateAlarmIntent" },
        }),
      ]),
    ],
    59649,
    463140863
  );
}

/** AcadKit Focus: see the top of the file. */
export function focusShortcut(feedUrl) {
  const [get, until] = feedValue(feedUrl, "focusUntil");
  const say = uuid("arrive:value");
  return workflow(
    [
      ...get,
      action("getvalueforkey", { WFInput: output(uuid("focusUntil:fetch"), "Contents of URL"), WFDictionaryKey: "arrive", UUID: say }),
      ...ifPresent(until, [
        action("dnd.set", {
          Enabled: 1,
          FocusModes: { DisplayString: "Do Not Disturb", Identifier: "com.apple.donotdisturb.mode.default" },
          AssertionType: "Time",
          Time: textOf(until, "Dictionary Value"),
        }),
      ]),
      action("notification", { WFNotificationActionTitle: "AcadKit", WFNotificationActionBody: textOf(say, "Dictionary Value") }),
    ],
    59782,
    4282601983
  );
}

/** AcadKit Leave: see the top of the file. Cancel on the question stops it there. */
export function leaveShortcut(links) {
  const [get, question] = feedValue(links.today, "leave");
  const reply = uuid("leave:reply");
  const said = uuid("leave:say");
  return workflow(
    [
      ...get,
      ...ifPresent(question, [
        action("alert", { WFAlertActionTitle: "AcadKit", WFAlertActionMessage: textOf(question, "Dictionary Value"), WFAlertActionCancelButtonShown: true }),
        action("downloadurl", { WFURL: links.leave, WFHTTPMethod: "POST", UUID: reply }),
        action("getvalueforkey", { WFInput: output(reply, "Contents of URL"), WFDictionaryKey: "say", UUID: said }),
        action("notification", { WFNotificationActionTitle: "AcadKit", WFNotificationActionBody: textOf(said, "Dictionary Value") }),
      ]),
    ],
    62228,
    4282601983
  );
}

/** What the share sheet offers this Shortcut: photos, PDFs and any other file. */
const SHARED = ["WFAVAssetContentItem", "WFGenericFileContentItem", "WFImageContentItem", "WFPDFContentItem"];

/** AcadKit: see the top of the file. Each shared item goes up as it is, named; the feed puts it in Inbox/. */
export function acadkitShortcut(links) {
  const shared = uuid("share:if");
  const heard = uuid("ask:heard");
  const question = uuid("ask:encoded");
  const reply = uuid("ask:reply");
  const sentence = uuid("ask:say");
  const each = uuid("share:each");
  const name = uuid("share:name");
  const encoded = uuid("share:encoded");
  return workflow(
    [
      action("conditional", { GroupingIdentifier: shared, WFControlFlowMode: 0, WFCondition: 100, WFInput: { Type: "Variable", Variable: attach(INPUT) } }),
      action("repeat.each", { GroupingIdentifier: each, WFControlFlowMode: 0, WFInput: attach(INPUT) }),
      action("getitemname", { WFInput: attach(REPEAT_ITEM), UUID: name }),
      action("urlencode", { WFInput: textOf(name, "Name"), UUID: encoded }),
      action("downloadurl", {
        WFURL: text(`${links.share}&name=`, ref(encoded, "URL Encoded Text")),
        WFHTTPMethod: "POST",
        WFHTTPBodyType: "File",
        WFRequestVariable: attach(REPEAT_ITEM),
        UUID: uuid("share:send"),
      }),
      action("repeat.each", { GroupingIdentifier: each, WFControlFlowMode: 2, UUID: uuid("share:each:end") }),
      action("notification", { WFNotificationActionTitle: "AcadKit", WFNotificationActionBody: "Sent to your study folder's Inbox. Your Mac files it at its next sync." }),
      action("conditional", { GroupingIdentifier: shared, WFControlFlowMode: 1 }),
      action("dictatetext", { WFDictateTextStopListening: "After Pause", UUID: heard }),
      action("urlencode", { WFInput: textOf(heard, "Dictated Text"), UUID: question }),
      action("downloadurl", { WFURL: text(`${links.ask}&q=`, ref(question, "URL Encoded Text")), UUID: reply }),
      action("getvalueforkey", { WFInput: output(reply, "Contents of URL"), WFDictionaryKey: "say", UUID: sentence }),
      action("speaktext", { WFText: textOf(sentence, "Dictionary Value"), WFSpeakTextWait: true }),
      action("conditional", { GroupingIdentifier: shared, WFControlFlowMode: 2 }),
    ],
    59708,
    463140863,
    { types: ["ActionExtension"], inputs: SHARED }
  );
}

/** AcadKit Screenshot: see the top of the file. The screenshot goes up under its own name (IMG_1234.PNG). */
export function screenshotShortcut(links) {
  const shot = uuid("shot:latest");
  const name = uuid("shot:name");
  const encoded = uuid("shot:encoded");
  return workflow(
    [
      action("getlastscreenshot", { WFGetLatestPhotoCount: 1, UUID: shot }),
      action("getitemname", { WFInput: output(shot, "Latest Screenshots"), UUID: name }),
      action("urlencode", { WFInput: textOf(name, "Name"), UUID: encoded }),
      action("downloadurl", {
        WFURL: text(`${links.share}&name=`, ref(encoded, "URL Encoded Text")),
        WFHTTPMethod: "POST",
        WFHTTPBodyType: "File",
        WFRequestVariable: output(shot, "Latest Screenshots"),
        UUID: uuid("shot:send"),
      }),
      action("notification", { WFNotificationActionTitle: "AcadKit", WFNotificationActionBody: "Screenshot sent. A portal page goes into the app at your Mac's next sync." }),
    ],
    59474,
    463140863
  );
}

/** Where the Shortcuts call: today's feed, the share endpoint, Siri's ask and Leave's leave. */
export function feedLinks(supabaseUrl, token) {
  const root = `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/feeds`;
  return { today: `${root}/today?token=${token}`, share: `${root}/share?token=${token}`, ask: `${root}/ask?token=${token}`, leave: `${root}/leave?token=${token}` };
}

/** A workflow as a signed .shortcut: JSON → binary plist (plutil) → `shortcuts sign`. */
export async function signedShortcut(workflowObject, { sign = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "acadkit-shortcut-"));
  try {
    const json = path.join(dir, "w.json");
    const plist = path.join(dir, "w.shortcut");
    const signed = path.join(dir, "signed.shortcut");
    await writeFile(json, JSON.stringify(workflowObject));
    await run("/usr/bin/plutil", ["-convert", "binary1", json, "-o", plist]);
    if (!sign) return await readFile(plist);
    await run("/usr/bin/shortcuts", ["sign", "--mode", "anyone", "--input", plist, "--output", signed]);
    return await readFile(signed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Each Shortcut's name and how it is built from the feed links. */
const BUILDS = [
  ["AcadKit Alarm", (l) => alarmShortcut(l.today)],
  ["AcadKit Focus", (l) => focusShortcut(l.today)],
  ["AcadKit Leave", (l) => leaveShortcut(l)],
  ["AcadKit", (l) => acadkitShortcut(l)],
  ["AcadKit Screenshot", (l) => screenshotShortcut(l)],
];
export const NAMES = BUILDS.map(([n]) => n);

/**
 * Build, sign and upload the Shortcuts when the account's token has
 * changed since the last build; take them down when it was revoked. A
 * fingerprint of the token on this Mac says what was built last, and is
 * written only once the uploads are done: Apple's signing service now and
 * then answers 500, and the next tick tries again.
 */
export async function syncShortcuts({ supabase, pin, supabaseUrl, state = STATE, make = signedShortcut, log = console.log }) {
  const { data, error } = await supabase.from("feed_tokens").select("token").eq("device_id", pin).maybeSingle();
  // Before migration 047 there is nothing to build for.
  if (error && /does not exist|schema cache/i.test(error.message)) return null;
  if (error) throw new Error(`Couldn't read the feed token: ${error.message}`);
  const token = data?.token ?? null;
  const print = token ? createHash("sha256").update(token).digest("hex") : "none";
  if ((await readFile(state, "utf8").catch(() => "")) === print) return null;

  const bucket = supabase.storage.from(BUCKET);
  const keys = NAMES.map((n) => `${pin}/shortcuts/${n}.shortcut`);
  if (!token) {
    await bucket.remove(keys);
    log("Shortcuts: token revoked, taken down");
  } else {
    const links = feedLinks(supabaseUrl, token);
    for (const [i, [, build]] of BUILDS.entries()) {
      const bytes = await make(build(links));
      const { error: upErr } = await bucket.upload(keys[i], bytes, { contentType: "application/octet-stream", upsert: true, cacheControl: "0" });
      if (upErr) throw new Error(`Couldn't upload ${NAMES[i]}: ${upErr.message}`);
    }
    log(`Shortcuts: built and signed ${NAMES.join(", ")}`);
  }
  await mkdir(path.dirname(state), { recursive: true });
  await writeFile(state, print);
  return token ? "built" : "removed";
}
