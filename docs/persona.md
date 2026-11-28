# PersonaOS

PersonaOS is AcadKit's Mac side grown into one system. It reads everything my degree sends me, acts on it, and puts what matters on my iPhone without my opening anything. It has to survive every semester switch and run on one Claude plan.

## Status

| Part | State |
|---|---|
| Orchestrator (`scripts/persona.mjs`) | Built |
| WhatsApp collector (`persona/whatsapp.py`) | Built; first real read 28 Nov: 628 messages from 2 groups |
| Deadline engine (`persona/deadlines/`) | Built on rules; a local model joins later |
| Calendar feed (`scripts/lib/persona/calendar.mjs`) | Built |
| Collectors, engines, phone surfaces | Planned, one PR a day until 16 Dec 2026 |

## Rules

| Rule | Why |
|---|---|
| Works unopened | Features that needed a new habit (Autopilot, the class recorder, flashcards, Siri) went unused and were removed in November 2026 |
| Pushes only on change | A push that repeats yesterday teaches me to ignore pushes |
| Drafts, never sends | No message, mail or submission leaves without me |
| Raw text stays on the Mac | Message and mail bodies never reach Supabase; only extracted items with one quoted source line do |
| Every engine is measured | A nightly replay or a weekly score; a miss becomes a test |
| 14-day cut rule | An engine nobody uses for 14 days is redesigned or removed |

## Orchestrator

`com.acadkit.persona` (installed by `npm run mac:install`) starts a tick every minute. A tick runs every due job in `scripts/lib/persona/jobs.mjs` side by side and exits. launchd never starts a tick while the last one runs, and an asleep Mac ticks at wake.

```bash
npm run persona                 # one tick
npm run persona -- list         # each job's last run, and whether it's due
npm run persona -- run <job>    # one job now, whatever its schedule
```

| Piece | File | Does |
|---|---|---|
| Schedule | `scripts/lib/persona/schedule.mjs` | `every` N minutes, or `at` times of day; a `window` of hours; a missed slot runs at wake unless it's over 3 h old |
| Retries | same | A failure retries after 1, 2, 4 … minutes, capped at the job's interval (an hour for `at` jobs) |
| Alerts | same | A macOS notification at the third failure in a row (`alertAfter`), and one when it works again |
| Locks | `scripts/lib/persona/store.mjs` | One lock file per job holding its pid; a lock from a dead process is taken over |
| Time limit | `scripts/lib/persona/tick.mjs` | Each job gets `timeoutMin` (5) and an abort signal; the tick exits after its longest limit either way |
| Claude cap | `scripts/lib/persona/budget.mjs` | Jobs call `spendClaude(n)` first; `PERSONA_CLAUDE_CAP` (20 a day) keeps background work off the plan's weekly limit; the Desk's Ask isn't counted |

State lives in `~/Library/Application Support/AcadKit/persona/`: one record per job in `jobs/`, the locks in `locks/`, and `claude.json`. The log is `~/Library/Logs/AcadKit/persona.log`. `PERSONA=off` in `.env.local` turns it off.

A job is `{ name, every | at, window?, timeoutMin?, alertAfter?, graceMin?, run(ctx) }`. `run` gets `{ signal, now, log, spendClaude }`, may return a short note, and should stop when `signal` aborts.

## WhatsApp collector

WhatsApp's messages are read every 10 minutes (`persona/whatsapp.py`, `scripts/mac/whatsapp-read.sh`).

- macOS lets launchd's bash, and Apple's tools it starts, read WhatsApp's database under Full Disk Access, but not node or python. So the agent's tick (`scripts/mac/persona-tick.sh`) runs the read in bash before the orchestrator, and only `/usr/bin/sqlite3 -readonly` opens WhatsApp's file.
- The read has four steps. sqlite3 lists the columns; python checks them and plans one query; sqlite3 runs it; python stores the rows. A schema change stops the run and names the missing columns.
- It watches the groups in the semester pack, `<STUDY_DIR>/_src/semester.json` (`whatsapp.groups`). `PERSONA_WHATSAPP_GROUPS` overrides the pack. Names match ignoring case. `scripts/mac/whatsapp-read.sh --chats` lists chat names for the pack.
- Each group keeps its own cursor. A group's first run reads back `PERSONA_WHATSAPP_DAYS` (60) days and moves the cursor past older rows too, because WhatsApp's row numbers don't follow message dates.
- New messages go to `persona.sqlite` on the Mac with sender, time, text and any file's path. Rows with neither text nor a file are dropped.
- The read writes `persona/whatsapp/status.json`. The orchestrator's `whatsapp` job reports it, so a failed or silent read alerts like any job.
- Engines run from bash read `.env.local` themselves (`persona/env.py`). `npm run test:persona` runs the engines' tests; CI runs them too.

## Deadline engine

The `deadlines` job runs every 15 minutes (`persona/deadlines/`, ported from hearsay) over the last 120 days of stored messages.

| Step | Does |
|---|---|
| Prefilter | Keeps messages with an assessment word and a date cue |
| Extract | One claim per message: the first course the pack's cues name (code, full name, short name of 3+ letters, listed cues), the kind, the date read against the day it was sent, a time, the units. "11th experiment" is not a date |
| Roles | Faculty and CRs by contact name or WhatsApp id from the pack's `whatsapp.faculty` and `whatsapp.cr`; a name starting "Dr" or "Prof" counts as faculty |
| Track | Claims sharing an instance code (FT-II, FJ2, CT 1) fold into one item, and a message naming two links them; a bare mention joins the one open item of its course and kind |
| Resolve | The date comes from faculty, then the CR, then a classmate, then me; the latest said within a rank |
| Verify | Flags `moved`, `conflict`, `stale` and `past`; an undated item, or a disagreement with no faculty word, gets a question |
| Output | Upcoming items to `<STUDY_DIR>/_src/persona_suggestions.json` when faculty or the CR said so, or a classmate stated a full date plainly with nothing disputing it |

The study sync reads that file beside the weekly scan's `acadkit_suggestions.json`, so each item reaches the app as an Add, or a Move when it carries `moved_from`. `python3 -m persona.deadlines show` lists every tracked item with its flags and questions.

`npm run persona -- eval` scores the engine against AcadKit's own deadlines (`persona/deadlines/replay.py`). It replays every stored message day by day, so each day the engine sees only what was sent by then. Courses come from AcadKit's subjects, so a course whose study folder is gone still counts. It reports:

| Measure | Meaning |
|---|---|
| Recall | AcadKit deadlines due in the messages' window that the engine ends with on the right day |
| Precision | The engine's dated items that match an AcadKit deadline |
| Lead | Days between the engine first having the right date and the deadline (median) |
| Baseline | The same items dated by the latest message alone, ignoring who said it |

It also lists the misses and the items AcadKit doesn't have, and keeps the result in `persona/eval.json`. Only the watched groups are read, so recall measures what those groups carried.

## Calendar feed

The `calendar` job (every 30 minutes) publishes my deadlines as an `.ics` my iPhone Calendar subscribes to.

- It lists AcadKit's deadlines from the last 30 days on, the ones I've confirmed, with ✓ on those done. Then it adds the deadline engine's upcoming suggestions that match no confirmed deadline by course and day, as "? DAA FT-I (not confirmed)" with the source line in the notes.
- Each event is an hour long with an alert the day before. Calendar refreshes the feed hourly.
- The file goes to `<pin>/calendar/<secret>.ics` in the private study bucket. `npm run persona -- calendar` prints the `webcal://` link, signed once for five years. A new secret in `persona/calendar.json` retires the old link.

## Sources (planned)

| Source | Holds | How | Login |
|---|---|---|---|
| Student Portal | Attendance, marks, timetable, results | Playwright with its own profile; a light request every 10 min may keep the session open, if the portal's timeout counts idle time | ID and password from Keychain; I answer the CAPTCHA on my phone |
| Academia | Subjects, faculty, semester calendar | Playwright | ID and password from Keychain |
| WhatsApp | Notices, relays, files | Apple's sqlite3, read-only, from the agent's bash (built) | Full Disk Access for /bin/bash |
| Gmail | Course, GitHub, freelance and job-alert mail | IMAP with sender filters | App passwords in Keychain |
| GitHub | CI, pull requests, commits | `gh` | `gh auth` |

The Student Portal asks for a CAPTCHA on every login. The Mac fills ID and password, sends the CAPTCHA image to my phone through the bucket (the Desk's Ask pattern), and finishes the login with what I type. Nothing solves the CAPTCHA by machine. Two wrong-password replies stop it, so the account never locks.

## Engines (planned)

| Engine | In | Out |
|---|---|---|
| Semester | A semester pack (courses, units, timetable, calendar, watched groups) | The PYQ bank, predictions, solved papers and Desk plan, from one pipeline instead of a copy per semester folder |
| Deadlines | WhatsApp, mail, the portal | One record per deadline with every source and version, faculty trusted over relays, moved dates flagged; deadlines and an ICS feed |
| Standing | Attendance and marks | A push only when a choice matters ("missing DBMS tomorrow drops you to 74%") |
| Learning | My course plan, Desk progress, my ML repo's commits | The next exercise on Today, one re-test a day in Practice; Ask hints and never writes my code |
| Career | GitHub, freelance and job-alert mail | CI failures, pull requests waiting on me, an earnings ledger, matched internships, résumé bullets I approve |
| Ask | A local index of messages, mail, notes and commits | Answers that cite the source message |
