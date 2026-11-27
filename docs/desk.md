# Study Desk

The Desk replaces the Run-up. It brings the Mac Study Desk's exam preparation into AcadKit as
three screens: Today (the Run-up's day plan), Priorities and Practice. Claude is a tap away from
any question, and the phone and the Mac share progress. The Desk's other pages move into AcadKit's
own: Month into the Calendar, Tests into Deadlines, and the topic and video lists into each
Subject page. It is part of 2.0 ([v2.md](v2.md)).

## Decisions

25 Nov 2026:

- Native screens, not the desk page in a frame.
- No scan images. Every paper is already on Study, so a question opens its PDF in the viewer, on
  its page.
- The Run-up's day plan becomes the Desk's Today. Plan ticks keep their table (migration 043).

26 Nov 2026 (after the Sem 4 desk's Priorities and Practice):

- **Three Desk screens.** Today, Priorities and Practice. Answers, Revision and Analysis are parts
  of them, not screens.
- **Month, Tests and Subjects move into existing pages.** Plan days and test windows show in the
  Calendar. FTs, unit tests, lab exams and end-sems become deadlines with countdowns. Units, topics,
  topic status, videos and notes go to the Subject page.
- **Class-test questions are kept by unit, not by test.** A question's unit comes from its topic,
  so when a CT's portion changes year to year, every earlier question is still under its unit.
- **Ask Claude on the phone.** The Mac answers with my Claude plan, at no extra cost. When the Mac
  is away, the question opens in Claude with its context filled in.

27 Nov 2026:

- **All of it ships at once, in one squashed PR.** The 13 slices planned for 1–22 Dec became one
  change, and the Run-up goes now instead of after a December gate.
- **Sem 3's OS ships until its end-sem.** OS has 200 keyed MCQs and 116 solved Part B/C answers,
  so it rides along with Sem 4 until 30 Nov (`showUntil`) and drops out the next day.

## Done when

- The Desk works on the iPhone and the Mac: Today, Priorities (by test and by unit) and Practice.
- The Calendar shows plan days and test windows, Deadlines lists every test, and each Subject page
  shows its units, topics, videos and notes.
- Part A questions grade themselves where a key exists. A written question opens its worked answer
  where one exists. Coverage of both shows per course.
- A tick, MCQ pick, attempted mark or revision flag made on the phone shows on the Mac after the
  next sync, and the reverse.
- Ask Claude from a practice question on the phone returns an answer through the Mac. When the Mac
  is away, the question opens in Claude.
- Old `/runup` links and notifications land on the same day or event.

## Screens

| Screen | Route | Shows |
| --- | --- | --- |
| Today | `/desk`, `/desk/<day>`, `/desk/event/<id>` | The day's tasks, carried-over tasks and ticks, from `runup.json` as before |
| Priorities | `/desk/priorities` | By test: lock-in by position, topics ranked by expected marks, the smallest set, the back-test, the Prediction Checks and Repeats PDFs. By unit: topics with CT and end-sem counts, then every question grouped by topic, CTs first, repeats shown once with each paper that asked them |
| Practice | `/desk/practice` | One question at a time, filtered by unit, topic, source, part, status and text. Options graded where keyed, the worked answer's page, attempted and revision flags, the paper on its page, Ask Claude |

Each screen keeps its course, test, unit and filters in the URL, so a link or a reload lands on
the same view. The top-bar chip and the sidebar open the Desk.

| Moved | To | Shows |
| --- | --- | --- |
| Month | Calendar | Plan days (green dot) and test windows and semester dates (lime line), with the day's plan in its sheet |
| Tests | Deadlines | Each test with its window, exact day once set, units and countdown; a test opens its Priorities |
| Subjects | Subject page | Units, topics with Not started / Learning / Done / Revise, videos with watched ticks, notes and papers |

## Data

- Each study folder's `_src/export_desk.py` writes `_src/acadkit_desk.json`.
  - Sem 4's reads `study_desk/sem4_priorities.json` and `sem4_desk.json`.
  - Sem 3's builds OS only, from its own `pyq_predict.py` and `repeats_by_position.py` with Sem 4's helpers, adding the MCQ keys (`dashboard_ui/keys/OS.json`) and each solved question's page (`Operating_Systems/solved_papers/pages.json`).
- `scripts/lib/desk.mjs` checks both files:
  - A file that isn't a desk throws, and the sync keeps the last good one in the bucket.
  - A bad or repeated item is dropped with a warning.
  - A link the folder doesn't have is cleared, never hiding its item.
- The sync merges the two folders (this semester first) and uploads `<pin>/desk.json`, an index with each course's counts and tests, plus one content-named part per course under `<pin>/desk/`. The phone loads one course at a time and keeps every part it has fetched.
- A question carries its paper's path and page, and its worked answer's, and the viewer opens either there.
- Answers are links to solved PDFs, so the app renders no answer HTML. Ask Claude's replies show as text, with code blocks, and never as HTML.

## Progress

- `desk_progress` (migration 065) holds one row per item: status, flag, pick, attempted at, result, note and updated at.
  - It is owner-only like the other PIN tables, with pgTAP tests.
  - An older write never replaces a newer one (a trigger compares `updated_at`).
  - A write broadcasts on `pin:<pin>`, so the other device refetches.
- Keys:
  - a question is `<course>/<item>`
  - a topic is `topic:<course>:<unit>.<topic>`
  - a video is `video:<YouTube id>`
- Writes go through the offline mutation queue (`desk.progress`). Each carries the whole row merged with what the phone already holds, so practice works offline.
- `scripts/desk-bridge.mjs` runs at the end of every sync and keeps the Mac app's progress SQLite and the table in step.
  - A snapshot of the last run tells a Mac change from a phone one, and the later write wins.
  - A phone change goes into the app's file only while the app is closed, since the open app saves over it.

## Ask Claude

- On the phone, Ask uploads the question, its context (course, paper, slot, options, file and page) and the thread so far to `<pin>/inbox/ask/<id>.json`.
- `scripts/desk-ask.mjs` runs on the Mac under launchd (`com.acadkit.deskask`, from `npm run mac:install`).
  - It checks the inbox every 3 s.
  - It runs the same Claude Code call as the Mac app's panel: Read, Grep and Glob in the right study folder, with no connectors.
  - It rewrites `<pin>/ask/<id>.json` every 1.5 s as the answer streams in.
- It writes `<pin>/ask/heartbeat.json` every minute. When that is over 3 minutes old, or the Mac hasn't started within 15 s, the phone offers "Open in Claude" with the question filled in.
- A thread lasts while its question is open, and each follow-up carries the turns before it.

## Risks

- **Topic labels are keyword rules.** Spot-checks were right about 9 times in 10, so a wrong label can be corrected on the Mac and re-published.
- **Two apps write progress.** One table, item-level last-write-wins, tested on both sides.
- **The Mac app holds its state while open.** A phone change waits for the app to close before it reaches the app. The table always has it.
- **Ask depends on the Mac.** The Open in Claude fallback keeps it useful when the Mac is asleep.

## Not in the Desk

- Lecture videos play on YouTube from the Subject page. The Mac app plays its local copies.
