# AcadKit

[![CI](https://github.com/KunalShukla-Al/Acadkit/actions/workflows/ci.yml/badge.svg)](https://github.com/KunalShukla-Al/Acadkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

My academic app for SRM KTR: attendance, marks and SGPA, the Day Order timetable, deadlines and my
study files, on my phone and my Mac. It's a PWA that syncs across devices, and my Mac does the
heavy work: it mirrors my study folder, indexes it for search, and links notes, slides and past
papers that are about the same thing.

<p align="center"><img src="public/demo.webp" width="300" alt="AcadKit on a phone: Today's classes and deadlines, Attendance, Marks, the corner opening onto the calendar and marking a class, the days you can skip, and Study" /></p>

## Five tabs

<p align="center">
  <img src="docs/screens/today.webp" width="150" alt="Today: the class on now, the day's classes and what's due" />
  <img src="docs/screens/timetable.webp" width="150" alt="Timetable: a Day Order's classes" />
  <img src="docs/screens/attendance.webp" width="150" alt="Attendance: the overall gauge and each subject" />
  <img src="docs/screens/marks.webp" width="150" alt="Marks: the predicted SGPA and each subject's internals" />
  <img src="docs/screens/study.webp" width="150" alt="Study: the study folder and search" />
</p>

- **Today**: a greeting by the hour, the day's classes, the one on now and the one next, then
  what's due. Above them only what needs me: a suggestion, a page to continue, an undo.
- **Timetable**: the classes of each Day Order, on SRM's 5-day rotation.
- **Attendance**: how many classes each subject can spare, what it takes to get back above the
  bar, a forecast, and a heatmap of the semester.
- **Marks**: the predicted SGPA, each subject's internals, and what each remaining test needs for
  the grade I want.
- **Study**: my notes folder from the Mac, with search inside files, a viewer for
  PDF, Word, PowerPoint, spreadsheets and code, and on each page what links to it: a moment in
  class, a past paper's question, another set of notes ([how a link is chosen](docs/connected.md)).

The **Run-up**, a day-by-day plan to the end-sems, is a chip in the top bar that counts the day's
targets. The **corner**, a lime quarter-disc above the tab bar showing today's Day Order, opens the rest:
the calendar, the days I can skip, past semesters and settings.

## On the Mac

- **The sync** mirrors my study folder within seconds of a change, and the menu bar shows the day
  and how each job went. A delete or share on the phone reaches the Mac in a second
  ([the instant link](docs/instant-link.md)). Setup: `npm run mac:install`.
- **The night shift** shrinks big PDFs and re-indexes at 02:00 on the charger, and the morning
  notification says what it did. Setup: [docs/night-shift.md](docs/night-shift.md).
- **Continue**: the page I was reading on the phone is offered on the Mac, at that page; the
  other way, Finder → Quick Actions → Send to AcadKit phone.

## On the iPhone

Shortcuts my Mac builds for my account set an alarm before the first class, turn on Do Not
Disturb through class hours, and send files from the share sheet to the study folder.
Setup: [docs/shortcuts.md](docs/shortcuts.md) and [docs/campus.md](docs/campus.md).

## Themes

Settings carries three looks, synced with the account:

- **Brutalist** (the default) — lime on near-black or near-white, oversized lowercase titles in
  Chakra Petch, bordered squircle cards.
- **Apple** — the iOS/macOS look: the system font (real SF Pro on my iPhone and Mac), neutral
  grouped-gray backgrounds, a system-blue accent and continuous-corner cards, with the tabs drawn
  in the native idiom so AcadKit reads like a system app.
- **OLED** — true black with no colour, for an always-on screen.

Each is a set of light-and-dark design tokens, and a unit test holds every theme to WCAG AA
contrast.

## What stays private

The one model, gte-small for search and links, runs on my Mac, and nothing in AcadKit holds a key
to a model API. The iPhone reaches my data through one token I can revoke. The reasons are
in [docs/adr](docs/adr/README.md), and what protects what is in [SECURITY.md](SECURITY.md).

## How well it works

The part that runs a model is measured against answers I know. [EVAL.md](EVAL.md) has the
details, how each was run, and the command to run it again.

| Part | Measured on | Result |
| --- | --- | --- |
| Links by meaning (Everything connected) | 100 links the app shows, a fresh sample, judged by Claude reading both items; my own check is still to do | 73 of the 100 right (64% to 81% at 95% confidence): 80% from a question to notes, 73% from notes to a slide, 68% from a question to a slide. |

On the five tabs, Lighthouse scores 100 for performance and accessibility, signed in
(`npm run perf:screens`).

## Quick start

```bash
npm install
npm run dev:mock    # runs with fake data, no setup needed
```

To use your own data, create a [Supabase](https://supabase.com) project, run the files in
`supabase/migrations/` in order, then add `.env.local`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

and start the app with `npm run dev`. The Mac's side needs `SUPABASE_SERVICE_ROLE_KEY` and
`STUDY_PIN` there too. Never give the service key a `VITE_` prefix: anything prefixed `VITE_` is
bundled into the app, where anyone can read it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run dev:mock` | Dev server on a local mock backend |
| `npm run build` | Typecheck and production build |
| `npm run test` | Unit tests |
| `npm run test:e2e` | Browser tests on the mock (Playwright); `test:visual` for the screen pictures |
| `npm run size` | The built bundle against its budget |
| `npm run perf:screens` | Lighthouse on the five tabs, signed in to the mock |
| `npm run mac:install` | The Mac's launch agents, menu bar and Quick Action |
| `npm run sync:files` | Mirror the Mac's study folder to the app |
| `npm run send:phone -- <files>` | What the Finder's Send to AcadKit phone runs |
| `npm run demo:record` | Re-record `public/demo.webp` from the mock |
| `npm run errors` | Crash reports from the app, grouped |

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): how it's put together and the rules that keep it correct.
- [docs/adr](docs/adr/README.md): the decisions that shape it, and what each costs.
- [EVAL.md](EVAL.md): the measurements above, in full.
- [SECURITY.md](SECURITY.md): what protects what, and how to report a problem.

## Stack

React · TypeScript · Vite · Tailwind · TanStack Query · Motion · Supabase

## License

[MIT](LICENSE)
