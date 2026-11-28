# PersonaOS

PersonaOS is AcadKit's Mac side grown into one system. It reads everything my degree sends me, acts on it, and puts what matters on my iPhone without my opening anything. It has to survive every semester switch and run on one Claude plan.

## Status

| Part | State |
|---|---|
| Orchestrator (`scripts/persona.mjs`) | Built |
| WhatsApp collector (`persona/whatsapp.py`) | Built; first real read 28 Nov: 628 messages from 2 groups |
| Deadline engine and its replay score (`persona/deadlines/`) | Built on rules; a local model joins later |
| Gmail collector (`persona/gmail.py`) | Built; reads once its accounts and app passwords are added |
| GitHub snapshot (`persona/github.py`) | Built |
| Phone: calendar, widget, morning brief (`scripts/lib/persona/phone.mjs`) | Built |
| Ask over my class groups (`persona/export.py`) | Built |
| Student Portal and Academia reader (`persona/portal.py`) | Built and run on the real pages 28 Nov: 7 subjects' attendance and marks, 9 timetable rows, 365 planner days |
| Semester runner (`persona/semester.py`) | Built |
| Learning line, the 14-day cut rule (`scripts/lib/persona/usage.mjs`) | Built |

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
| Extract | One claim per message: the first course the pack's cues name (code, full name, short name, the name's initials such as DSA or TBVP, listed cues), the kind (a retest is its own kind), the first date written, read against the day it was sent, a time, the units. "11th experiment" is not a date, and "marks" is not March |
| Roles | Faculty and CRs by contact name or WhatsApp id from the pack's `whatsapp.faculty` and `whatsapp.cr`; a name starting "Dr" or "Prof" counts as faculty |
| Track | Claims sharing an instance code (FT-II, FJ2, CT 1) fold into one item, and a message naming two links them; a bare mention joins the one open item of its course and kind, unless that item's dates had all passed when it was said |
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

First real score (28 Nov 2026, Sem 3, AS1 OFFICIAL and AS1 unofficial, 628 messages): 5 of 27 AcadKit deadlines, 5 of 13 dated items matching, a median 11 days ahead. Only 5 of the 27 were ever stated in those two groups with their course and date, so the engine caught every one it could see; the rest came from other groups, Classroom and the exam timetable. Several of the 8 items AcadKit lacks are real (an FDS retest, the UHV-II assignment). With no CR or faculty named in the pack, ranking by sender matches the latest-message baseline (5 = 5).

## Gmail collector

The `gmail` job (every 15 minutes) reads mail from senders that matter (`persona/gmail.py`).

- Accounts are listed in `persona/config.json`. `python3 -m persona.gmail add <address>` lists one and prints the Keychain command for its app password (service `acadkit.gmail`), which Apple's `security` reads at each run.
- It reads headers only, sender and subject, from the inbox opened read-only, and never fetches a body. A first run looks back 14 days; then a cursor per account (with its UIDVALIDITY) reads only what's new.
- Mail from Mercor, GitHub, the job boards (LinkedIn, Internshala, Naukri, Wellfound, Unstop, Instahyre) and course sites (Coursera, DeepLearning.AI, NPTEL) becomes a signal in `persona.sqlite`; the rest is skipped. The last day's signals go to `persona/mail.json` for the brief.

## GitHub snapshot

The `github` job (hourly) asks `gh` for my open pull requests, their checks (passing, failing, running or none), and the days in the last week I pushed, and writes `persona/github.json` (`persona/github.py`).

## Phone

The `phone` job (every 30 minutes) and the `brief` job (06:30, or at wake within 4½ hours) put PersonaOS on my iPhone (`scripts/lib/persona/phone.mjs`).

| Surface | What | Where |
|---|---|---|
| Calendar | AcadKit's deadlines from the last 30 days on, ✓ on those done, plus the engine's upcoming suggestions that match no confirmed deadline by course and day, as "? DAA FT-I (not confirmed)" with the source line in the notes; an hour each, an alert the day before, hourly refresh | `<pin>/calendar/<secret>.ics`; `npm run persona -- calendar` prints the `webcal://` link |
| Widget | What's due in the next three days, how many dates from my groups wait to be confirmed, and when the Mac last refreshed it | `<pin>/calendar/<secret>-today.json`, read by `scripts/mac/scriptable/acadkit-today.js` in Scriptable; `npm run persona -- widget` prints its link |
| Morning brief | At most four lines AcadKit's own reminders don't cover: new dates from my groups, what the engine couldn't settle, Mercor and job mail, and GitHub (PRs waiting for my merge, failing checks, no push yesterday) | `<pin>/persona/brief.json`; `send-reminders` pushes it once, on its first run between 07:00 and 11:00 that finds today's |

Both links are signed once for five years and kept in `persona/calendar.json`; a new secret there retires them.

## Ask over my class groups

The `export` job (every 30 minutes) writes the watched groups' last 120 days to `<dir>/_src/_persona/messages.md` in this semester's folder and the next one's, a line per message, grouped by group and day (`persona/export.py`). Folders starting with "_" never sync, so the file stays on the Mac. The Desk's Ask (`scripts/desk-ask.mjs`) is told to open it for questions about an announcement, a date or what someone said.

## Portals

PersonaOS never logs in. The Student Portal's login checks for bots well beyond its CAPTCHA (a browser fingerprint, a challenge, a reCAPTCHA token), so I log in myself in Chrome on the Mac and leave the tab open; Academia's session lasts days.

- Every 10 minutes whenever the Mac is awake, the tick runs `scripts/mac/portal-read.sh`. Apple's `osascript` runs `scripts/mac/portal-read.js`, which finds my Student Portal and Academia tabs and fetches pages through my session in the background, the way each portal's own menu does. It never opens, moves or reloads a tab. Chrome must allow it: View → Developer → Allow JavaScript from Apple Events.
- Each read is activity on the Student Portal session, so an **idle timeout never fires between reads**. A login then lasts until the Mac sleeps or restarts. If the portal uses a fixed timeout regardless of activity, it still ends mid-day; nothing a reader does can hold it, and automating the login is out, because the portal's login runs bot checks beyond its CAPTCHA and beating them risks the NetID.
- `persona/portal.py` reads the tables by header text, as AcadKit's paste parser does:

| Page | Table | Goes to |
|---|---|---|
| Student Portal attendance (form 9) | Code · Description · Max. hours · Att. hours · Absent hours · Total Percentage | `portal_snapshots` every read, with a history row (source `mac`, migration 066) when a number changes; send-reminders' low-attendance and day-plan pushes then use today's numbers |
| Student Portal internal marks (form 13) | Code · Description · Mark / Max. Mark | A "New marks" line in the brief when a total changes |
| Academia timetable | Course Code · Course Title · … · Faculty Name · Slot · Room No. | The semester pack's courses, each with its faculty and slots (a lab is its own row); faculty names join `whatsapp.faculty`, so the deadline engine trusts them |
| Academia academic planners (the latest two) | Per month: Dt · Day · event · DO | The pack's `calendar`: each date's day order and event |

- The page dump holds my data and is deleted as soon as it's read.
- Every login and logout is timestamped (`state.json` `sessions`), so the real timeout is measured, not guessed. A logged-out tab, or none, leaves the last numbers in place.
- The moment a session drops, the `portal` job uploads `<pin>/persona/alert.json`; `send-reminders` pushes "Student Portal logged out at HH:MM" to my phone within its next 10-minute run, any hour, once per logout. The next morning brief leads with the same line until I log back in.

## Semester runner

`npm run persona -- semester` runs the pack's `pipeline` from the semester's folder, step by step, stopping at the first failure (`--next` for next semester's folder, `--dry-run` to list). Sem 4's pack lists the PYQ bank, predictions, repeats, priorities, the Study Desk build and the Desk export, in the order `_src/build_pyq_dataset.py` documents.

## The 14-day cut rule

`npm run persona -- usage` counts, over 14 days, the dates from my groups offered, added and dismissed in the app, the briefs pushed, and the Ask questions, and names any engine nobody used. The Sunday brief carries the same numbers. The calendar and the widget are read by the phone without telling the Mac, so they can't be counted.

## Learning

The brief's "Learning today" line is the day's `learn:` task from the Run-up plan (`_src/acadkit_runup.json`).

## Engines still planned

| Engine | In | Out |
|---|---|---|
| Semester, further | The pack's pipeline | The scripts themselves moved into one shared copy instead of one per semester folder |
| Learning, further | Desk progress, my ML repo's commits | Re-tests of weak topics in Practice; Ask hints and never writes my code |
| Career, further | Mail signals and GitHub | An earnings ledger, matched internships, résumé bullets I approve |
