# Study Desk

The Desk replaces the Run-up tab. It brings the Mac Study Desk's exam preparation into AcadKit:
today's plan, tests, topic priorities from past papers, graded practice, worked answers, revision
and analysis, with the same progress on the phone and the Mac. It ships in 2.0
([v2.md](v2.md)); the release candidate is due 31 December 2026.

## Decisions (25 Nov 2026)

- Native screens, not the desk page in a frame. The Sem 3 desk page is 37 MB, 32 MB of it scan
  images; its data is about 4 MB.
- No scan images. Every paper is already on Study, so a question opens its PDF in the viewer, on
  its page.
- The Run-up's day plan becomes the Desk's Today. Plan ticks keep their table (migration 043).
- I build the screens on Sem 3's desk data, the richest set I have (7–11 papers per course, worked
  answers, MCQ keys). From the semester switch the Desk shows Sem 4: FTs, lab exams and end-sems,
  filled in as papers arrive.
- The old Run-up goes only after the Desk passes its gate on 22 December.

## Done when

- The Desk tab works on the iPhone and the Mac: Today and Month, Tests, Priorities, Practice,
  Answers, Revision and Analysis.
- Part A questions grade themselves from the key, and every written question with a worked answer
  shows it.
- A tick, readiness change, revision star or MCQ pick made on the phone shows on the Mac after the
  next sync, and the reverse.
- The Mac Study Desk app reads and writes the same progress.
- Sem 4's desk data loads for its courses.
- Old `/runup` links and notifications still land on the right day.

## Screens

| Screen | Shows | Source |
| --- | --- | --- |
| Today | The day's tasks, carried-over tasks, ticks | `runup.json`, as now |
| Month | Tasks per day, tests per month | `runup.json`, desk tests |
| Tests | Each FT, CLA, lab exam and end-sem: date, countdown, units, papers, readiness | Desk data |
| Priorities | Topics ranked by predicted marks for Part A, B 8-mark, B 10-mark and C; readiness; revision star | Desk data, predictions |
| Practice | One question at a time: printed options graded on pick, a written answer, the scan on its page; answer choices and timed scores | Desk data, MCQ keys |
| Answers | The worked answer under each question | Desk data (Markdown) |
| Revision | Starred and "needs revision" topics and questions | Progress |
| Analysis | Master analysis, question catalogue and study plan, with a section rail | Desk data |

## Data

- The Mac writes `_src/acadkit_desk.json` from the study desk: subjects, papers, questions,
  topics, predictions, MCQ keys and worked answers. It follows `acadkit_runup.json`.
- `scripts/lib/desk.mjs` validates it, and the sync uploads one file per subject under
  `<pin>/desk/`, so the phone loads one course at a time.
- A question carries its paper's path, page and position, and the viewer opens it there.
- Worked answers ship as Markdown. The app renders code and tables and never runs HTML from the
  file.

## Progress

- A new table, `desk_progress` (pin, item key, status, flag, pick, result, note, updated at), is
  owner-only, like the other PIN tables, with pgTAP tests.
- Writes go through the offline mutation queue, so practice works without a connection.
- The Mac app's `progress.sqlite` is imported once. After that the app writes to the same table,
  and the later write wins per item.

## The Run-up's end

- `/desk` opens on Today. `/runup` and `/runup/:event` redirect, and the top-bar chip and sidebar
  item point at the Desk.
- Until the Desk's Today matches the Run-up day for day, both exist and the tab stays on the
  Run-up. The Sem 4 head start (1 Dec–21 Jan) runs on that plan.
- The Run-up's code is removed in the last slice.

## Slices

| Date | PR | Done when |
| --- | --- | --- |
| Tue 1 Dec | `feat(desk): publish desk data from the Mac` | The export and its validator pass tests; the sync uploads one file per course; a bad file fails loudly and keeps the last good one |
| Wed 2 Dec | `feat(db): desk progress with owner-only access` | Migration, RLS and pgTAP owner/other-owner/anon tests; queued offline writes |
| Thu 3 Dec | `feat(desk): Desk tab with Today and Month` | `/desk` beside `/runup`; Today matches the Run-up's day, ticks included |
| Sat 5 Dec | `feat(desk): tests and priorities` | Per-course tests with countdowns; priorities per part with readiness and stars |
| Mon 7 Dec | `feat(desk): practice with graded MCQs` | Navigator by course, part, unit and paper; graded options; the scan opens on its page |
| Wed 9 Dec | `feat(desk): worked answers` | Code and tables render; no HTML runs; answer coverage shown |
| Fri 11 Dec | `feat(desk): revision queue and question library` | Filters, stars and readiness agree with Priorities |
| Sun 13 Dec | `feat(desk): answer choices and practice scores` | Chosen alternatives and marks per paper, saved per course |
| Tue 15 Dec | `feat(desk): analysis reports` | Reports read with a section rail; reading position saved |
| Thu 17 Dec | `feat(mac): one progress store for the Mac desk` | The Mac's progress imported; a change on either device shows on the other |
| Sat 19 Dec | `feat(desk): Sem 4 desk with FT, lab and end-sem papers` | The export reads SRM_Sem4; paper kinds FT, CLA, lab and end-sem; the course list follows the current semester |
| Mon 21 Dec | `refactor(runup): retire the old Run-up` | Tab, chip and redirects point at the Desk; old screens removed; bundle within budget |
| Tue 22 Dec | `test(desk): iPhone and Mac desk journey` | The gate: every screen used on a real iPhone and the Mac; progress agrees |

## Risks

- **The head start runs on the Run-up through December.** Today must not break mid-plan, so the
  tab switches only after the Desk's Today has matched it day for day.
- **Phone data.** Per-course files and the existing query cache keep a load to one course's data.
- **Answers contain code and tables.** Rendering must never run HTML, so it's tested with hostile
  input.
- **Two apps write progress.** One table, item-level last-write-wins, tested from both sides.
- **Plan load.** Thirteen Desk PRs sit on top of the daily plan. The Mac split view and `⌘K`
  prototypes are cut to make room (23–24 Dec become Desk buffer).

## Not in the Desk

- The Ask Claude panel stays in the Mac app.
- Lecture videos and notes per topic stay on the subject pages and in Study.
