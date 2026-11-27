# PersonaOS

PersonaOS is AcadKit's Mac side grown into one system. It reads everything my degree sends me, acts on it, and puts what matters on my iPhone without my opening anything. It has to survive every semester switch and run on one Claude plan.

## Status

| Part | State |
|---|---|
| Orchestrator (`scripts/persona.mjs`) | Built |
| WhatsApp collector (`persona/whatsapp.py`) | Built; its first run on the Mac checks WhatsApp's columns |
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

The `whatsapp` job runs every 10 minutes (`persona/whatsapp.py`).

- It opens the Mac app's `ChatStorage.sqlite` read-only and runs one short query per group, so WhatsApp's file is never written.
- It watches the groups in the semester pack, `<STUDY_DIR>/_src/semester.json` (`whatsapp.groups`). `PERSONA_WHATSAPP_GROUPS` overrides the pack. Names match ignoring case.
- Each group keeps its own cursor. A group's first run reads back `PERSONA_WHATSAPP_DAYS` (60) days and moves the cursor past older rows too, because WhatsApp's row numbers don't follow message dates.
- New messages go to `persona.sqlite` on the Mac with sender, time, text and any file's path. Rows with neither text nor a file are dropped.
- It checks the columns it reads before each run and stops, naming them, if WhatsApp's schema changes. `python3 -m persona.whatsapp schema` lists what it found without any message content, and `chats` lists group names for the pack.
- `npm run test:persona` runs the engines' tests; CI runs them too.

## Sources (planned)

| Source | Holds | How | Login |
|---|---|---|---|
| Student Portal | Attendance, marks, timetable, results | Playwright with its own profile; a light request every 10 min may keep the session open, if the portal's timeout counts idle time | ID and password from Keychain; I answer the CAPTCHA on my phone |
| Academia | Subjects, faculty, semester calendar | Playwright | ID and password from Keychain |
| WhatsApp | Notices, relays, files | A read-only connection to the Mac app's database (built) | Full Disk Access |
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
