// Supabase Edge Function: send-reminders
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { dispatchConfig, dispatchDeliver, needsDueCount, shouldDispatch } from "./dispatch.ts";
import { jobsFor, notYetSent, parseMode } from "./jobq.ts";
import { vapidFor, vapidKeys } from "./vapid.ts";

// --- semester calendar ---
import { OFFICIAL_HOLIDAYS } from "./calendar.generated.ts";

const DEFAULT_START = "2026-07-21";
const DEFAULT_END = "2026-11-18";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** Day Order 1–5 across every weekday in the window that isn't a holiday. */
function generateDayOrderMap(start: string, end: string): Record<string, number> {
  const map: Record<string, number> = {};
  let order = 1;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d) || OFFICIAL_HOLIDAYS[d]) continue;
    map[d] = order;
    order = (order % 5) + 1;
  }
  return map;
}

/** Declared holidays drop out and shift the remaining orders forward. */
function effectiveMap(
  declared: string[],
  start: string,
  end: string
): Record<string, number> {
  const canonical = generateDayOrderMap(start, end);
  if (!declared.length) return canonical;
  const set = new Set(declared);
  const dates = Object.keys(canonical);
  const orders = dates.map((d) => canonical[d]);
  const working = dates.filter((d) => !set.has(d));
  const map: Record<string, number> = {};
  working.forEach((d, i) => (map[d] = orders[i]));
  return map;
}

// --- IST clock (the app is single-region: SRM KTR) ---
function istNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const date = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  return { ist, date, minutes: ist.getHours() * 60 + ist.getMinutes() };
}
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${p}`;
};

/** Titles that mean the end-sem, as labelMatchKey leaves them (see EXTERNAL_ALIASES in packages/core/src/plan.ts). */
const END_SEM_TITLES = new Set([
  "endsem", "endsems", "endsemester", "endsemexam", "endsemesterexam", "endsemesterexamination",
  "finalexam", "final", "semexam", "semesterexam", "external", "theoryexam", "text", "ext", "theoryext", "theoryexternal",
]);

interface Msg {
  device_id: string;
  kind: string;
  ref: string;
  title: string;
  body: string;
  url: string;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  // How long a run takes, in the log and in the reply pg_net keeps (net._http_response):
  // the cron waits 20 s for it (migration 048).
  const started = Date.now();

  // The original pair stays the default, and setting it here still fails
  // the run early if it's missing. Each push names its own pair (vapidFor):
  // subscriptions moved to the new key are signed with the V2 secrets.
  const vapid = vapidKeys((name) => Deno.env.get(name));
  webpush.setVapidDetails(vapid.subject, vapid.original.publicKey, vapid.original.privateKey);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { ist, date, minutes } = istNow();
  const msgs: Msg[] = [];

  // Only the devices that actually subscribed. "*" carries vapid_public
  // (migration 041), and still works on a database without it.
  const { data: subs } = await sb.from("push_subscriptions").select("*");
  const deviceIds: string[] = [...new Set((subs ?? []).map((s) => s.device_id as string))];
  if (deviceIds.length === 0) return new Response(JSON.stringify({ sent: 0, ms: Date.now() - started }));

  for (const pin of deviceIds) {
    const [{ data: settings }, { data: subjects }, { data: timetable }, { data: attendance }, { data: deadlines }, { data: snapshots }] =
      await Promise.all([
        sb.from("settings").select("declared_holidays,sem_start,sem_end").eq("device_id", pin).maybeSingle(),
        sb.from("subjects").select("id,name,code,short_name,medical_leave").eq("device_id", pin),
        sb.from("timetable_slots").select("*").eq("device_id", pin),
        sb.from("attendance").select("subject_id,date,start_time,status").eq("device_id", pin),
        sb.from("deadlines").select("id,title,type,subject_id,due_date,status").eq("device_id", pin),
        sb.from("portal_snapshots").select("subject_code,conducted,absent,as_of").eq("device_id", pin),
      ]);

    const subjName = new Map((subjects ?? []).map((s) => [s.id, s.name]));

    /** What a deadline is called, matching deadlineLabel in src/lib/deadlines.ts. */
    const DEADLINE_TYPE_LABEL: Record<string, string> = {
      assignment: "Assignment",
      exam: "Exam",
      lab: "Lab",
      other: "Other",
    };
    const subjShort = new Map(
      (subjects ?? []).map((s) => [s.id, (s.short_name as string | null)?.trim() || null])
    );
    /**
     * "Data Structures & Algorithms lab due", or just "Lab due" when the
     * deadline was never assigned a subject - naming the type twice
     * ("Lab lab due") is the trap here.
     */
    const deadlineHeadline = (d: { type: string; subject_id: string | null }) => {
      const type = DEADLINE_TYPE_LABEL[d.type] ?? "Deadline";
      const name = (subjName.get(d.subject_id ?? "") as string | undefined)?.trim();
      if (!name) return `${type} due`;
      const label = subjShort.get(d.subject_id ?? "") || name;
      return `${label} ${type.toLowerCase()} due`;
    };

    /** Attendance per subject, matching computeSubjectAttendance in packages/core/src/attendance.ts. */
    const snapByCode = new Map(
      (snapshots ?? []).map((s) => [String(s.subject_code).trim().toUpperCase(), s])
    );
    // Mirrors isCounted / isAttended in packages/core/src/attendance.ts.
    const counted = (status: string) => status !== "holiday";
    const attendedStatus = (status: string) => status === "present" || status === "od";
    function heldFor(subjectId: string, code: string | null) {
      const rows = (attendance ?? []).filter(
        (a) => a.subject_id === subjectId && counted(a.status)
      );
      const snap = code ? snapByCode.get(code.trim().toUpperCase()) : undefined;
      if (snap && Number(snap.conducted) > 0) {
        const since = rows.filter((a) => a.date > snap.as_of);
        return {
          attended:
            Number(snap.conducted) - Number(snap.absent) +
            since.filter((a) => attendedStatus(a.status)).length,
          total: Number(snap.conducted) + since.length,
        };
      }
      return {
        attended: rows.filter((a) => attendedStatus(a.status)).length,
        total: rows.length,
      };
    }
    /** The bar each subject is held to, matching minAttendanceFor in packages/core/src/attendance.ts: 65% where medical leave is granted, else 75%. */
    const barById = new Map<string, number>(
      (subjects ?? []).map((s) => [s.id as string, s.medical_leave ? 65 : 75])
    );
    const declared = ((settings?.declared_holidays ?? []) as Array<{ date: string }>).map((h) => h.date);
    // Per device, exactly as the app reads it. The window has to be read
    // before anything asks whether today is inside it.
    const semStart = (settings?.sem_start as string | null) || DEFAULT_START;
    const semEnd = (settings?.sem_end as string | null) || DEFAULT_END;
    const inSemester = date >= semStart && date <= semEnd;
    const dayOrder = inSemester && !OFFICIAL_HOLIDAYS[date] ? effectiveMap(declared, semStart, semEnd)[date] : undefined;
    const todaySlots = (timetable ?? []).filter((s) => s.day_order === dayOrder);

    // 1) Class starting in the next ~15 min
    for (const slot of todaySlots) {
      const start = toMin(slot.start_time.slice(0, 5));
      const lead = start - minutes;
      if (lead > 0 && lead <= 15) {
        msgs.push({
          device_id: pin,
          kind: "class",
          ref: `${slot.id}|${date}`,
          title: `${subjName.get(slot.subject_id) ?? "Class"} in ${lead} min`,
          body: `${fmt(slot.start_time.slice(0, 5))}${slot.room ? ` · ${slot.room}` : ""} · Day Order ${dayOrder}`,
          url: "/",
        });
      }
    }

    // 2) Evening nudge to mark today's attendance (18:00–18:59)
    if (dayOrder && todaySlots.length && ist.getHours() === 18) {
      const marked = new Set(
        (attendance ?? [])
          .filter((a) => a.date === date)
          .map((a) => `${a.subject_id}|${a.start_time.slice(0, 5)}`)
      );
      const unmarked = todaySlots.filter(
        (s) => !marked.has(`${s.subject_id}|${s.start_time.slice(0, 5)}`)
      ).length;
      if (unmarked > 0) {
        msgs.push({
          device_id: pin,
          kind: "mark",
          ref: `mark|${date}`,
          title: "Mark today's attendance",
          body: `${unmarked} class${unmarked > 1 ? "es" : ""} still unmarked from today.`,
          url: "/attendance",
        });
      }
    }

    // 3) Deadlines due within 24h (morning sweep at 08:00)
    if (ist.getHours() === 8) {
      const now = Date.now();
      for (const d of deadlines ?? []) {
        if (d.status !== "pending") continue;
        // End-sem papers aren't deadlines (isEndSemDeadline in
        // src/lib/deadlines.ts, kept in step by hand): named like one,
        // or an exam after the last teaching day.
        const key = String(d.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const istDay = new Date(new Date(d.due_date).getTime() + 330 * 60_000).toISOString().slice(0, 10);
        if (END_SEM_TITLES.has(key) || (d.type === "exam" && istDay > semEnd)) continue;
        const due = new Date(d.due_date).getTime();
        const hrs = (due - now) / 3_600_000;
        if (hrs > 0 && hrs <= 24) {
          msgs.push({
            device_id: pin,
            kind: "deadline",
            ref: `${d.id}|${date}`,
            title: deadlineHeadline(d),
            // "within 24 hours" is the window that selected this row, not
            // news. The hour is the part you act on.
            body: hrs <= 12 ? "Due today." : "Due tomorrow.",
            url: "/deadlines",
          });
        }
      }
    }

    // 4) Low-attendance alert (once/day at 08:00), against each subject's
    //    own bar - a subject on medical leave at 70% is not below it.
    if (ist.getHours() === 8) {
      for (const subject of subjects ?? []) {
        const { attended, total } = heldFor(subject.id, subject.code as string | null);
        const bar = barById.get(subject.id) ?? 75;
        if (total >= 4 && 100 * attended < bar * total) {
          msgs.push({
            device_id: pin,
            kind: "low_attendance",
            ref: `low|${subject.id}|${date}`,
            title: `${subject.name ?? "A subject"} is under ${bar}%`,
            body: `You're at ${Math.round((attended / total) * 100)}%. Attend the next few to get back.`,
            url: "/attendance",
          });
        }
      }
    }

    // 5) The Mac has gone quiet (once/day at 20:00).
    if (ist.getHours() === 20) {
      const { data: hb } = await sb.storage.from("study-files").download(`${pin}/heartbeat.json`);
      let at: number | undefined;
      try {
        at = hb ? (JSON.parse(await hb.text()) as { at?: number }).at : undefined;
      } catch {
        at = undefined;
      }
      if (typeof at === "number" && Date.now() - at > 24 * 60 * 60_000) {
        const days = Math.floor((Date.now() - at) / (24 * 60 * 60_000));
        msgs.push({
          device_id: pin,
          kind: "mac_quiet",
          ref: `mac|${date}`,
          title: "Your Mac hasn't synced in a day",
          body: `It last checked in ${days === 1 ? "a day" : `${days} days`} ago. Open it so your files, deletes and uploads catch up.`,
          url: "/study",
        });
      }
    }

    // 6) What the Mac's night shift did (scripts/night-shift.mjs), once, at 07:00. A night it
    // skipped (on battery, asleep) or with nothing to do says nothing.
    if (ist.getHours() === 7) {
      const { data: file } = await sb.storage.from("study-files").download(`${pin}/night-shift.json`);
      let night: { night?: string; said?: string; failed?: string[] } | null;
      try {
        night = file ? JSON.parse(await file.text()) : null;
      } catch {
        night = null;
      }
      const failed = night?.failed?.length ? `${night.failed.join(" and ")} failed; the sync log says why.` : "";
      if (night?.night === addDays(date, -1) && (night.said || failed)) {
        msgs.push({
          device_id: pin,
          kind: "night_shift",
          ref: `night|${night.night}`,
          title: "Overnight on your Mac",
          body: [night.said, failed].filter(Boolean).join(" "),
          url: "/",
        });
      }
    }

    // 7) Morning verdict (08:00): can today actually be skipped?
    if (ist.getHours() === 8 && dayOrder && todaySlots.length) {
      const eff = effectiveMap(declared, semStart, semEnd);
      const remaining = new Map<string, number>();
      for (const [d, order] of Object.entries(eff)) {
        if (d < date || d > semEnd) continue;
        for (const slot of timetable ?? []) {
          if (slot.day_order !== order) continue;
          remaining.set(slot.subject_id, (remaining.get(slot.subject_id) ?? 0) + 1);
        }
      }

      const codeById = new Map(
        (subjects ?? []).map((s) => [s.id, (s.code as string | null) ?? null])
      );

      const spent = new Map<string, number>();
      const mustAttend: string[] = [];
      let firstBar = 75;
      for (const slot of todaySlots) {
        const { attended: p, total: t } = heldFor(
          slot.subject_id,
          codeById.get(slot.subject_id) ?? null
        );
        const rem = remaining.get(slot.subject_id) ?? 0;
        const bar = barById.get(slot.subject_id) ?? 75;
        const budget = Math.floor((100 * (p + rem) - bar * (t + rem)) / 100);
        const used = (spent.get(slot.subject_id) ?? 0) + 1;
        spent.set(slot.subject_id, used);
        if (budget - used < 0) {
          const name = subjName.get(slot.subject_id) ?? "A subject";
          if (!mustAttend.length) firstBar = bar;
          if (!mustAttend.includes(name)) mustAttend.push(name);
        }
      }

      msgs.push(
        mustAttend.length
          ? {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: `Attend today: ${mustAttend[0]} has no classes to spare`,
              body:
                mustAttend.length > 1
                  ? `${mustAttend.length} subjects today have no classes to spare.`
                  : `Missing today takes you under ${firstBar}%.`,
              url: "/",
            }
          : {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: `Today's ${todaySlots.length} class${todaySlots.length > 1 ? "es" : ""} can be skipped`,
              body: "Every subject today has classes to spare.",
              url: "/",
            }
      );
    }
  }

  // Who delivers: this function (off, shadow) or jobq (on). See jobq.ts.
  const mode = parseMode(Deno.env.get("REMINDERS_VIA_JOBQ"));

  // Start jobq's Deliver workflow now, rather than leave the work to
  // GitHub's schedule, which starts late or not at all (dispatch.ts).
  // Whatever happens here is logged and reported, never thrown: it doesn't
  // change what was sent or queued, or the status of the answer.
  const dispatchCfg = dispatchConfig((name) => Deno.env.get(name));
  async function startDeliver(enqueued: number): Promise<{ dispatched: boolean; dispatch_error?: string }> {
    try {
      let due = 0;
      if (dispatchCfg && needsDueCount(mode, enqueued)) {
        const { data, error } = await sb.rpc("jobq_due");
        if (error) {
          console.error("send-reminders: jobq_due failed", error);
          return { dispatched: false, dispatch_error: `jobq_due: ${error.message}` };
        }
        due = Number(data ?? 0);
      }
      if (!shouldDispatch(mode, enqueued, due)) return { dispatched: false };
      if (!dispatchCfg) {
        console.log("send-reminders: GITHUB_DISPATCH_TOKEN isn't set, so Deliver waits for its schedule");
        return { dispatched: false };
      }
      const result = await dispatchDeliver(dispatchCfg);
      if (!result.dispatched) {
        console.error("send-reminders: starting Deliver failed:", result.error);
        return { dispatched: false, dispatch_error: result.error };
      }
      return { dispatched: true };
    } catch (err) {
      const message = (err as { message?: string })?.message ?? String(err);
      console.error("send-reminders: starting Deliver failed:", message);
      return { dispatched: false, dispatch_error: message };
    }
  }

  // jobq delivers. Queue what hasn't been sent and stop: jobq pushes, and
  // writes sent_notifications only once a push is delivered.
  if (mode === "on") {
    let fresh = msgs;
    if (msgs.length) {
      // One query per 50 candidates; notYetSent picks the exact matches.
      // Not one for all of them: the filter goes in the URL, which has a
      // length limit, and PostgREST cuts a result at max-rows (1000)
      // without an error, which would read as "not sent" and send again.
      const done: Array<{ device_id: string; kind: string; ref: string }> = [];
      for (let i = 0; i < msgs.length; i += 50) {
        const batch = msgs.slice(i, i + 50);
        const { data, error } = await sb
          .from("sent_notifications")
          .select("device_id,kind,ref")
          .in("device_id", [...new Set(batch.map((m) => m.device_id))])
          .in("ref", [...new Set(batch.map((m) => m.ref))]);
        if (error) {
          // Not knowing what went out, anything queued now could repeat a
          // reminder already sent. Queue nothing; the next run tries again.
          console.error("send-reminders: reading sent_notifications failed", error);
          return new Response(
            JSON.stringify({ candidates: msgs.length, sent: 0, enqueued: 0, mode, error: error.message }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
        done.push(...(data ?? []));
      }
      fresh = notYetSent(msgs, done);
    }

    let enqueued = 0;
    if (fresh.length) {
      const { data, error } = await sb.rpc("jobq_enqueue", { jobs: jobsFor("on", fresh) });
      if (error) {
        console.error("send-reminders: jobq_enqueue failed", error);
        return new Response(
          JSON.stringify({ candidates: msgs.length, sent: 0, enqueued: 0, mode, error: error.message }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      enqueued = Number(data ?? 0);
    }

    const { dispatched, dispatch_error } = await startDeliver(enqueued);
    return new Response(
      JSON.stringify({
        candidates: msgs.length,
        sent: 0,
        already_sent: msgs.length - fresh.length,
        enqueued,
        mode,
        dispatched,
        dispatch_error,
      }),
      { headers: { "content-type": "application/json" } }
    );
  }

  // Dedupe + send
  let sent = 0;
  const subsByDevice = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const arr = subsByDevice.get(s.device_id) ?? [];
    arr.push(s);
    subsByDevice.set(s.device_id, arr);
  }

  for (const m of msgs) {
    const { error: dupe } = await sb
      .from("sent_notifications")
      .insert({ device_id: m.device_id, kind: m.kind, ref: m.ref });
    if (dupe) continue; // unique violation → already sent

    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.kind });
    for (const sub of subsByDevice.get(m.device_id) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: vapidFor(sub, vapid) }
        );
        sent++;
      } catch (err) {
        // 404/410 = subscription gone; clean it up
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          // A 401/403 here is usually a push signed with the wrong pair:
          // a row on the new key while the V2 secrets are unset or wrong.
          console.error("send-reminders: push failed", {
            status,
            new_key: !!vapid.v2 && sub.vapid_public === vapid.v2.publicKey,
            message: (err as { message?: string }).message,
          });
        }
      }
    }
  }

  const ms = Date.now() - started;
  if (mode === "off") {
    console.log(`send-reminders: ${sent} sent of ${msgs.length} in ${ms} ms`);
    return new Response(JSON.stringify({ candidates: msgs.length, sent, ms }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Shadow: everything above already happened exactly as with jobq off.
  // Also queue a do-nothing job per candidate, to compare with
  // sent_notifications later. Whatever goes wrong here is logged and
  // reported, never thrown.
  let enqueued = 0;
  let enqueueError: string | undefined;
  try {
    if (msgs.length) {
      const { data, error } = await sb.rpc("jobq_enqueue", { jobs: jobsFor("shadow", msgs) });
      if (error) throw error;
      enqueued = Number(data ?? 0);
    }
  } catch (err) {
    enqueueError = (err as { message?: string }).message ?? String(err);
    console.error("send-reminders: shadow jobq_enqueue failed", err);
  }

  const { dispatched, dispatch_error } = await startDeliver(enqueued);
  return new Response(
    JSON.stringify({ candidates: msgs.length, sent, ms, enqueued, mode, enqueue_error: enqueueError, dispatched, dispatch_error }),
    { headers: { "content-type": "application/json" } }
  );
});
