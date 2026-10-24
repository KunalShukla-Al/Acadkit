# Architecture

Notes on how AcadKit is put together and the rules that keep it correct.

## At a glance

AcadKit runs in three places, and the Mac does the heavy work:

```
 the app (phone, Mac browser)        Supabase                          the Mac
 ----------------------------        --------                          -------
 five tabs, brutalist look  ---->    Postgres, RLS by PIN    <----     sync tick, Autopilot,
 offline cache, file cache  <----    Broadcast on pin:<pin>            recorder, night shift
                                     study-files bucket      <----     files, links, jobs.json
 Shortcuts, Siri, Calendar  ---->    feeds edge function               menu bar, Quick Action
```

- The app reads and writes its own rows and listens for changes on its PIN's Broadcast topic. It
  keeps working offline: queries persist to IndexedDB, writes queue and replay, and opened files
  stay in a file cache.
- The Mac holds the study folder and the models. It uploads files and what it works out from them
  (links, topics, transcripts, prep), reads what you share into Inbox, and says when each job ran.
  Nothing it reads with a model leaves it except the result.
- The iPhone outside the app (Shortcuts, Siri, the calendar subscription) reaches the data only
  through the feeds function, with a token you can revoke.
- `packages/core` holds the rules all three use, so a number means the same on every surface.

Where each part is described:

- Foundations: Core, Accounts and data, Data flow.
- The app: Five tabs, Themes, Calendar, Marks and grades, Attendance, Run-up, Flashcards,
  File viewer, Show your work, Continue, PWA and iOS.
- The Mac: Study files (the sync, the menu bar), Autopilot, Class recorder, Night shift,
  Everything connected; the Quick Action is under Continue.
- Outside the app: Feeds (Shortcuts, Siri, the calendar), Portal sync.

The sections below follow that order.

Why it's shaped this way is in [docs/adr](docs/adr/README.md), starting with [0001, the Mac is
the brain](docs/adr/0001-the-mac-is-the-brain.md).

## Commands

```bash
npm run dev            # Vite dev server
npm run dev:mock       # dev server against a local mock backend (PIN 1234, seeded semester)
npm run build          # tsc -b over app, vite config, edge functions and scripts, then vite build
npm run test           # Vitest
npm run lint           # ESLint
npm run test:e2e       # Playwright against the mock; test:visual for the pictures (this Mac only)
npm run test:iphone    # the same suite on WebKit as an iPhone (Safari's engine), this Mac
npm run test:mac       # the same suite on WebKit as a Mac, 1440 × 900, this Mac
npm run size           # the bundle against bundle-budget.json, after a build
npm run perf:screens   # Lighthouse on the five tabs, signed in to the mock
npm run db:test        # pgTAP row-level security tests on a local Supabase (db:start first)
npm run mac:install    # the Mac's launch agents, menu bar and Quick Action
```

`@/` maps to `src/`.

A pre-commit hook (`.githooks/pre-commit`, turned on by `npm install` through the `prepare`
script) runs ESLint on the staged files and the incremental typecheck, a few seconds; CI runs both
in full. `git commit --no-verify` skips it once.

`tsc` is TypeScript 7 (the native compiler, `@typescript/native`). The `typescript` package is
TypeScript 6 (`@typescript/typescript6`, binary `tsc6`), kept because typescript-eslint needs its
JavaScript API, which TypeScript 7 doesn't have yet.

## Core

`packages/core` (an npm workspace, imported as `@acadkit/core/<module>`) holds the rules: the
domain types, dates, and the calculations the app, the edge functions and the Mac all need. It is
plain TypeScript with no React, Supabase or DOM, checked on its own with `lib: ["ES2022"]`, and
its modules import each other by relative path with the `.ts` extension, so Deno runs them as
they are.

## Accounts and data

- Sign-in is email and password. Every row is scoped by a 4-digit `device_id` (the PIN), and
  row-level security checks it with `private.owns_device()` (migrations 015, 049). The PIN is not the security
  boundary; the database is.
- Policies are `to authenticated`, so anything using the anon key gets 42501. That's why the
  portal bookmarklet posts to the `portal-ingest` edge function.
- New PINs are claimed first (`claimFreshPin`), then seeded (`seedAccount`, which only fills in
  what's missing).
- Signing out clears the persisted query cache and the on-device file cache
  (`useAuthReset`), and removes the device's push subscription.

## Data flow

```
Supabase <- src/api/<table>.ts <- src/hooks/useData.ts (React Query) <- pages
```

- `src/api` has one module per table or area (`settings`, `subjects`, `timetable`, `attendance`,
  `marks`, `deadlines`, `portal`, `history`, `suggestions`, `runup`, `cards`, `push`, `account`,
  and `studyFiles`, `feeds`, `siri`, `autopilot`), and `db.ts` for what they share.

- The Supabase client is typed by `src/lib/database.ts`: the types `npm run db:types` generates
  from the migrations (`database.types.ts`, which CI checks are current), with each jsonb column
  and each CHECK-listed text column narrowed to what it holds. Reads and writes are checked
  against it, so a column the app assumes is set is NOT NULL in the schema (migration 057).
- Every write is named (`src/api/mutations.ts`) so a write made offline survives a restart and
  replays in order. The PIN travels inside the variables.
- Inserts get their id on the client, so an add followed by an edit made offline still works.
- `useSync` keeps tabs and devices in step: BroadcastChannel between tabs, and Realtime
  Broadcast between devices. A write to a table the app shows sends one private "change" per PIN
  per statement on `pin:<pin>` from a trigger (migration 056), which only that PIN's owner may
  listen to. No table is in the WAL publication, so Realtime doesn't poll the write-ahead log.
- The query cache is persisted to IndexedDB for offline use (`src/lib/offlineStore.ts`), with
  localStorage as the fallback where IndexedDB won't open. localStorage was too small: Safari
  allows about 5 MB, and the Run-up and topics alone are 2.2 MB.
- The viewer's downloaded files and signed links are never persisted (`UNPERSISTED` in
  `App.tsx`); a Blob doesn't survive JSON.

## Five tabs

The app is five tabs: Today, Timetable, Attendance, Marks and Study (`src/lib/screens.ts`).
`screenOf(path)` says which tab a page lights; what the corner and the top bar open lights none.

- The phone's bar and the Mac's sidebar list the five, each lit for its pages (Attendance on
  `/log`, Today on `/deadlines`, Study on `/subject/…`). The phone's top bar holds the name and the
  Run-up chip; the Mac's sidebar holds the day order and the same chip above the five.
- Things move only on change: no page slides or fades in, no card fades up, no ring draws from
  zero and no list staggers in on arrival (each starts with `initial={false}`). What moves is
  what changed: a number that updates, a tab's pill, a row you open, a sheet, the corner, the
  explainers.
- Today (`src/pages/Today.tsx`, at `/`) is the day and what's due. Its title is a greeting by the
  hour (`Greeting`, "you're awake, kunal"), under a struck-out "welcome back, scholar" in the
  brutalist voice. Its card (`TodayCard`) shows
  today's classes, the one on now and the next, or the next day with classes once today's are
  over. Under it, the next three deadlines each open the Deadlines page (`/deadlines`, under the
  next exam's countdown). Above the day is only what needs you: a suggestion, a page to continue,
  Siri's and Autopilot's lines with Undo, each empty when there's nothing. Today's cards live in
  `src/components/home`.
- The Run-up chip (`src/components/layout/runup-chip.tsx`) rings the day's targets ticked and
  opens `/runup`; another day is `/runup/<date>`.
- The corner (`src/components/layout/corner.tsx`) is a lime quarter-disc fixed in the
  bottom-right corner, above the tab bar (`--nav-h`, which the bar keeps), carrying today's Day
  Order, a star on a day without classes. Tapped, it turns into a close button, and Calendar,
  Skips, Flashcards (with the count waiting), History and Settings burst out of it as tilted
  stickers, kept clear of the bars. Escape or a tap elsewhere closes it.
- Attendance (`/attendance`) and Marks (`/marks`) each lead with their number, the overall gauge
  and the predicted SGPA (tap it for its explainer), then Now and Forecast, Marks and Targets.
- Study (`/study`) is the study folder: its folders, search inside files and lectures, and the
  viewer and transcripts that open over it with their Connected line. Opened from a link with
  nothing behind them, the viewer and a transcript close onto Study (`studyPath`). Under the
  folders sit the projects, the week's notices and new files, and the Mac's line.
- The Mac's line (`MacLine`, `src/lib/macJobs.ts`) closes Study: a job that failed, else a Mac
  that hasn't synced in a day, else "Your Mac is keeping up · synced 4 min ago". Tapped, it lists
  when the study sync, Autopilot, the class recorder and the night shift last ran, with what each
  said. The Mac stamps them into `<pin>/jobs.json` (`scripts/lib/jobs.mjs`), uploading at most
  every 10 minutes, or at once when a job starts or stops failing; stamping never fails a job.
- Tomorrow offline (`src/lib/tomorrow.ts`, `src/lib/tomorrowOffline.ts`): from 18:00, while the
  app is open, the next class day's files go into the file cache the viewer reads first
  (`src/lib/fileCache.ts`). First each test that day's prep files, then the three newest notes of
  each course with a class, up to 80 MB. It checks on opening, every half hour and on coming back
  online; files already kept cost nothing. Wi-Fi only where the browser says which network it's
  on, never with data saving; iPhone browsers don't say, so there it runs whenever it's evening.
  Settings turns it off per device. The fetching code loads only when it runs. Once a run has
  kept something, Settings says so under the switch ("Tomorrow's files are on this device · 4
  files, 18 MB"; "Today's" the next morning), until that day has passed.
- `npm run perf:screens` runs Lighthouse on each tab signed in (`scripts/lighthouse-screens.mjs`):
  a production build against the mock, mobile throttling, median of three, CI's limits. Console
  errors are the mock's (no Realtime socket, a thin study folder) and are listed, not counted.
  On 21 Oct: performance and accessibility 100 on all five, LCP 1.4 to 1.8 s, TBT at most 17 ms,
  CLS at most 0.03. `npm run size` also checks the heaviest tab's first open (its page's chunk
  beyond the start bundle): 34.8 KB, Study. The budget (`bundle-budget.json`) sits a little above
  that day's sizes.
- `e2e/accessibility.spec.ts` runs axe (WCAG 2.1 A and AA; serious and critical fail) on every
  tab and every page the corner and the top bar open, light and dark, with the corner open, with
  Continue and Tomorrow offline's hint showing, with an explainer's sheet open, and at midday,
  when some of the day's classes are over. A sheet's body takes focus, so a keyboard can scroll it even when
  nothing in it does.
- Old links (notifications, bookmarks, the Shortcuts) can still name the old screens, Grades,
  Plan and You, which have no route of their own now. The shell sends each to the page it meant
  before it draws (`movedTo`: `/grades?show=marks` to `/marks`, `/plan?show=runup` to `/runup`,
  `/you` to `/settings`, `/files?dir=…` to `/study?dir=…`), keeping the rest of the query and the
  hash.

## Themes

Brutalist (the default) and OLED, set on `[data-theme]` and synced with the account (migration
018). A theme stored before either existed (quiet, sakura, terminal, aurora) comes back as
brutalist. Brutalist is lime on near-black or near-white with a coral second accent, squircle
cards with a real border and no shadow, and its titles and numbers in Chakra Petch
(`--font-display`): page titles oversized and lowercase, section labels lowercase and
wide-tracked (`src/index.css`). OLED is true black with no colour.

`src/lib/voice.ts` holds the app's copy in the theme's register (`useTone`). Brutalist talks back,
lowercase and blunt ("currently trapped", "30 min of your life left"); OLED talks quietly, short
statements with the number first. Each line is written plain, and a theme's own line replaces it
where it has one. Notifications and Siri keep the plain line.

- The pages are built from the primitives in `src/components/primitives`: `Figure` (a number, its
  unit and what it counts), `Line` (one sentence with a mark and a value), `Row` and `Rows` (a
  list with hairlines between), `Sheet` (one decision, its actions at the foot) and `Empty`.
  `/design` shows each of them, and every theme's tokens, in the current theme;
  `npm run test:visual` compares it on a phone and a Mac-sized screen, light and dark, with
  pictures of this Mac's rendering (CI skips them: Linux draws text differently). It compares
  the first view of each tab, the Run-up and Settings the same way, at 1x so the pictures stay
  small, and the corner open, with the study folder's sync time and the build's commit masked.
- Each theme's tokens, light and dark, live in `src/design/tokens.json`. `npm run tokens` writes
  them to `src/design/tokens.css` as custom properties, which a unit test keeps in step. The
  theme list (`THEME_NAMES`), the store's theme-color and the pre-paint script in `index.html`
  (filled in by `vite.config.ts`) all read the same file.
- `src/design/contrast.test.ts` measures every token pair the app sets one on the other, in every
  theme and mode, against WCAG AA: text 4.5:1, the accent as a shape 3:1. It runs with the unit
  tests in CI. Brutalist's light lime is let off as a shape: it is a fill under ink (the active
  tab, the corner, a lit chip), never a mark on the page by itself.

## Calendar

SRM runs a 5-day rotating Day Order. `packages/core/src/semester.ts` holds the semester window
and the official holidays; `packages/core/src/calendar.ts` resolves a date. Declared holidays shift the rotation
onto the remaining working days (`buildEffectiveMap`). A declared entry with a `day_order` is a
class day instead: a weekend or holiday that follows that Day Order without moving the rotation.
`send-reminders` keeps its own copy of this logic. After editing official holidays run
`node scripts/gen-edge-calendar.mjs` and redeploy `send-reminders`.

## Marks and grades

- Grades: O >= 91, A+ >= 81, A >= 71, B+ >= 61, B >= 56, C >= 50. Passing is 50 overall, nothing
  else.
- SGPA counts credit-bearing, graded courses only (`countsInSgpa`). UHV-II and the other LEM
  courses carry credits but are pass/fail.
- A subject is a budget of 100 marks (`solveSubjectPlan` in `packages/core/src/plan.ts`): what's banked,
  what's still to play, and the equal rate everything left must return for the target.
- The internal weight is per subject (`assessment.internal`); the component plan may be partial,
  and unclaimed weight stays as one "not announced" bucket.
- Components match by normalised label (`labelMatchKey`: CT-1 = FT-1 = FJ-1, FJ-II = FJ-2).
- A deadline you log with marks is adopted as a component if there's room; otherwise it only
  dates an existing one.
- Rounding: marks you need round up, marks you hold round down, totals floor.
- Attendance below the minimum bars the end-sem, and that outranks everything on a card.
- Grade odds (`packages/core/src/odds.ts`): empirical-Bayes prior over your subjects, 3,000 seeded
  simulations, SGPA read off the same draws.

**Marks page:** two tabs, Marks (entry) and Targets. Targets reads the expected solve
(`packages/core/src/expected.ts`): a test you've sat but haven't got back asks what you expect, and an
expectation counts in the plan without ever being saved as a mark.

## Attendance

- The bar is per subject: 75%, or 65% with medical leave, which is set for the whole semester
  in Settings. Everything asks `minAttendanceFor(subject)`.
- Arithmetic is integer, with the bar as a whole percentage.
- Every screen starts from the portal's totals (`computeSubjectAttendance`) and layers classes
  marked since.

## Run-up

- `/runup` is a day-by-day plan to the end-sems, read from `<pin>/runup.json`. The sync writes it
  from the study folder's `_src/acadkit_runup.json` after `scripts/lib/runup.mjs` has checked it:
  one bad day, task or event is dropped with a warning, file links the sync doesn't know are
  dropped, and a repeated task id is refused so one tick can never count for two tasks.
- `runup.json` is an index (the window and the events) naming a file of days per month and a file
  of past-paper questions per event under `<pin>/runup/`, each named by its content's hash
  (`splitRunup`). The app keeps every part it has fetched, so an edit to today's tasks downloads
  the index and one month (24 KB gzipped) instead of the plan (140 KB); an event's questions load
  with its page. The sync keeps the previous index's parts for one more sync.
- Ticks live apart from the plan, in `plan_ticks` (migration 043), keyed by task id, so the plan
  can be rewritten without losing them. Ticking is a named write (`runup.tick`), so it survives
  being offline and closing the app.
- An unticked task carries to today until the event it prepares for has happened
  (`itemsFor` in `src/lib/runup.ts`). Past and future days show only their own plan.
- `/runup` opens today's day, from the top bar's chip; another day is its own page, `/runup/<date>`.
- The plan runs past the end-sems into the next semester's head start, so `semester:switch` carries
  it and its generators into the new folder (`carryRunup` in `scripts/lib/semester.mjs`): links
  filed ahead as `SRM_Sem4/…` lose the prefix, links to the old folder's files go, and task ids
  stay, so ticks survive. A link may also name the study folder itself, which keeps the
  generators' `SRM_Sem4/…` links working after the switch.

## Flashcards

- The deck opens from the corner's Flashcards, which counts the cards waiting
  (`components/flashcards/waiting-badge.tsx`) once the sync has sent `<pin>/cards.json`. The
  count and the deck are lazy chunks, loaded only when the corner opens.
- The sync writes `cards.json` from the study folder's `_src/acadkit_cards.json` after
  `scripts/lib/cards.mjs` has checked it: a bad card is dropped with a warning, and a repeated id
  is refused so one review can never count for two cards. The file's order is the order new
  cards are shown in.
- Reviews live in `card_reviews` (migration 045): one row per card with its Leitner box and due
  day, keyed by card id, so the deck can be rebuilt without losing them. Saving one is a named
  write (`cards.review`). The schedule and the queue are pure functions in `src/lib/flashcards.ts`.

## File viewer

`/view` opens a file in the app: PDF (pdf.js legacy build), Word, PowerPoint, spreadsheets,
code and images.

- It opens over the page it came from (`useViewerLinkState`), so closing it keeps the page's
  scroll position and open groups.
- Zoom follows a pinch with some resistance and springs back past 1x and 4x
  (`src/lib/zoom.ts`). PDFs redraw sharp at the settled zoom.
- Find in file uses the CSS Highlight API; PDFs get a pdf.js text layer.
- Files opened once are cached on the device (`src/lib/fileCache.ts`, 400 MB), and rows
  prefetch on touch.
- Office files open as the Mac's conversion, made at sync (`scripts/lib/renditions.mjs`). Until
  it exists, a .docx uses the browser's reader and the rest offer the download.

## Show your work

Every number the app works out can show how (`packages/core/src/working.ts`). A function keeps
its signature, and its `…Working` twin (`packages/core/src/explain.ts`, and `src/lib/dayWorking.ts`
for Skips' days) returns the same value with its working; they live apart from the modules
they explain so only the explainers load them, not the screens. A working is steps, each a
sentence that reads on its own (the explainer's caption) and its sum when it has one, plus the
figures the steps used, by name, for an explainer to draw. `gradeWorking` is the first: where a
total falls in the grade table, and the points that grade is worth.

- `attendanceWorking`: where the count comes from (the portal up to its date and what you marked
  since, or what you marked), the percentage, and how far it is from the subject's bar.
- `skipsWorking`: the inequality that keeps you at the bar, solved for the classes you can skip
  (rounded down) or must attend in a row (rounded up).
- `dayWorking` (`src/lib/survival.ts`): why a day is free or not, class by class: how many of that
  subject's classes left you need, how many you can miss (the earliest), and where this one falls.
- `planWorking`: marks needed: what's banked, where the target grade starts, what's still to play
  for (tests and the end-sem), the share of it the target needs, and what that asks of the next test.
- `sgpaWorking`: each subject's grade points times its credits, added up and divided by the credits.
- `oddsWorking`: the ability the odds start from (your graded tests, weighed with your other
  subjects), the simulation of what's left, where the totals land, and how many reach the target.

Explainers play a working as a short animated scene (`src/components/explainer`, `src/lib/explainer.ts`).
The player draws a scene's SVG on a 16:9 stage (320 × 180 units) with the step's sentence and sum
under it, and steps through on its own: each step stays up 2.5 to 9 seconds, long enough to read,
a step with a sum a beat longer. Back, Play or Pause, Next and a dot per step take over. A scene
is a component of the working's figures and the step, and moves its shapes with Motion's spring
(`SCENE_TRANSITION`, with a short fade for opacity), the same in every scene. Scenes start without an entrance (`initial={false}`),
so a player at rest shows its step as it ends; `/design` has each scene that way.

- Captions sit in a strip of their own under the scene, so they never cover it, and bring the
  step's sentence out a word at a time while it plays, at the pace the step's time allows (45 ms a
  character after a beat; `captionAt`); paused, the whole sentence. They keep their own time in a
  component of their own, so their ticks don't redraw the scene. CC turns them off, remembered on
  the device (`acadkit:captions`); the sentence under the stage stays for screen readers.
- The voice (`src/lib/speech.ts`) is off unless turned on, and remembered (`acadkit:voice`). It is
  the browser's speech synthesis with a voice that runs on the device where there is one (Indian
  English first, then British, then American), so nothing is sent anywhere to be spoken. With it,
  a step moves on a beat after its sentence is said, and captions follow the spoken words; a
  browser that never says it's done moves on anyway at twice the step's reading time.
- "Make a video" (where `MediaRecorder` can record a canvas: MP4 where it can, else WebM) plays
  the explainer from the start at reading pace, with the controls held, and draws each frame onto
  a 1280 × 900 canvas (`src/lib/explainerVideo.ts`): the scene, copied with its computed colours
  and fonts written on and Motion's inline styles kept, and the step's sentence under it. The
  video is silent, so the sentence is always drawn in. "Save video" then saves it, a second tap,
  since iOS opens the share sheet only from one. An SVG drawn as an image can't use the page's
  web fonts, so its text falls back to the system's.
- Tap a number to see its working (`Explain` in `src/components/explainer/explain.tsx`): it's
  underlined, dotted, and opens a sheet with its explainer. The working and the scenes load only
  then (`explainer-for.tsx`), so the pages don't carry them. On Marks, the predicted SGPA;
  under Attendance, a subject's classes to spare and to make up (skips) and "How 84.0% is worked
  out" (attendance); under Skips, each day's free or needed label (a day); under Marks, the
  Targets view's marks a grade needs (marks needed). Grade odds have an explainer but no number
  on screen yet.
- Where the device asks for reduced motion, the player is stills instead (`ExplainerStills`):
  every step as a still of its scene, with its sentence and sum under it, to read at your own
  pace. Nothing moves and nothing plays on its own.

- Attendance (`scenes/attendance.tsx`): the classes as squares, attended ones filled (two rows of
  30 at most; past 60 classes a square is several); then a bar filling to the percentage; then the
  subject's bar marked on it, the fill turning good or bad.
- Skips (`scenes/skips.tsx`): the inequality, then its answer, then the classes it comes to as
  squares, outlined for ones you can skip, filled for ones you must attend (15 drawn at most).
- A day (`scenes/day.tsx`): the day's classes as blocks, each coloured in as its step comes,
  needed or one you can miss; the last step says whether it's a day off. `dayWorking` gives each
  class's flag as a figure (`class0`, `class1`, …).
- Marks needed (`scenes/marks.tsx`): on a 0–100 scale, what's banked; the target's line and the
  gap to it; what's still to play for, dashed; and the part of it the target needs, filled.
- SGPA (`scenes/sgpa.tsx`): each subject a bar as wide as its credits and as tall as its grade
  points, in as its step comes; then the SGPA, their credit-weighted level, as a line across them.
- Odds (`scenes/odds.tsx`): the share of a test's marks you're expected to take; what's banked;
  the middle 80% of where the runs finish and their median; the target's line and the share past it.

## Continue

What you're reading on one device, picked up on the other (`src/lib/reading.ts`, migration 062).

- The viewer says where you are once you've been on a PDF page for 3 seconds: `reading_now`, one
  row per account (the file, the page, and whether it's a phone or a computer: a touch screen with
  no mouse is a phone). It is sent live like the tables in 056.
- Today on the other kind of device offers it (`ContinueBanner`): "Continue Unit3_CPU_Scheduling_Slides
  at p. 24 · from your phone", opening the viewer at that page. A page from half an hour ago, from
  the same kind of device, or already open, isn't offered.
- On the Mac the menu bar offers the phone's page too, as a link to the app's viewer at it.
- From the Mac to the phone: "Send to AcadKit phone" in the Finder's Quick Actions (an Automator
  workflow, `scripts/mac/send-to-phone.workflow`, put in `~/Library/Services` by `mac:install`) runs
  `scripts/mac/send-to-phone.mjs` with the files picked. One already in the study folder is on the
  phone already; one from elsewhere is copied into Inbox, which the sync uploads in seconds. The
  last becomes where you're reading, from the computer, so the phone's Today offers it; a
  notification on the Mac says which.

## PWA and iOS

- Precache only; the viewer's chunks aren't precached.
- Launch screens for each iPhone size (`node scripts/generate-splash.mjs`); icons from
  `node scripts/generate-icons.mjs`.
- Form fields are 16px (iOS zooms smaller ones), overscroll is off, and safe areas come from
  `pt-safe-t` / `pb-safe-b`.
- After a deploy, a missing lazy chunk reloads the page once (`src/lib/staleChunk.ts`).

## Study files

- `npm run sync:files` mirrors the Mac's study folder (`~/Documents/SRM_Sem3`) into the private
  `study-files` bucket. Blobs are named by content hash, and `manifest.json` lists the tree.
  Needs `SUPABASE_SERVICE_ROLE_KEY` and `STUDY_PIN` in `.env.local`; never prefix the service key
  with `VITE_`.
- `STUDY_NEXT_DIR` (optional, e.g. `~/Documents/SRM_Sem4`) mirrors next semester's folder too, as
  one more top folder named after it (`SRM_Sem4/…`, `scripts/lib/roots.mjs`). Its files are tagged
  inside that folder, indexed and mined like the rest, so a course's page knows its notes and past
  papers before the semester starts. `semester:switch` to that folder drops the setting.
- `<folder>/_src/acadkit_paperbank.json` holds the past papers read with their layout. It is a fixed
  export: nothing regenerates it, so a paper filed after 12 Oct 2026 has no entry. The sync
  (`scripts/lib/paperbank.mjs`) tags past-paper files in the manifest (`pyq`: old syllabus, another
  course's paper, poor scan; search ranks those lower at a near tie) and sends `<pin>/prereqs.json` for
  the course page's "Revise first". Its clean question text replaces the raw split in topic mining only
  with `STUDY_PAPERBANK_QUESTIONS=1`.
- PDFs over 8 MB go up shrunk by Ghostscript (`/ebook`, 150 dpi images) when that saves a quarter
  or more; the Mac keeps the original, and the copy is cached by its hash and uploaded under the
  original's key (`scripts/lib/shrink.mjs`, `brew install ghostscript`). The manifest's `size` is
  what the app downloads.
- The free plan stores 1 GB. Each sync adds up the bucket, uploads nothing that would take it past
  950 MB (a file that doesn't fit stays off Study until there's room), and writes
  `<pin>/storage.json` for Study's meter (`scripts/lib/storage.mjs`).
- The app never edits the mirror. Deletes and uploads are requests the Mac acts on
  (migrations 032, 033).
- Files shared from the iPhone land in `Inbox/`, and the tick files them (`scripts/lib/inbox.mjs`):
  a name with a subject's code or short name goes to its `02_Notes` (in `Unit_<n>` when the name
  says one); then what Autopilot is sure a file shows decides (below); then anything that arrived
  during a class goes to that subject's `02_Notes/Class_Photos/<date>`, by the Day Order calendar
  and timetable from core. The rest stays.
- The Mac side lives in `scripts/mac` and is installed with `npm run mac:install`: a launch agent
  keeps a folder watcher running (`watch.mjs`, FSEvents), which runs the auto-sync tick
  (`auto-sync.sh`) 10 s after the study folder goes quiet, and every 3 minutes for the app's
  requests. The watcher also listens on a private Realtime Broadcast channel, `mac:<pin>`, with
  the service role key (`link.mjs`), and runs the tick as soon as a request is heard, or straight
  after the run going. Inserts into `study_file_deletions` and `study_uploads` (the app's deletes
  and uploads, and the share feed's) send it one message per PIN per insert from a trigger
  (migration 054), so a request reaches the Mac in well under a second. A public message on that
  topic, or one for another PIN, never reaches it; while the link is down the 3-minute tick still
  picks requests up. On the same channel the Mac tracks Presence: "awake", or "syncing" while a
  tick runs. Asleep, its socket drops and its presence with it. The app may listen to that
  presence for a PIN it owns and to nothing else there (migration 055), and Study says "Mac
  awake", "Mac syncing…" or "Mac asleep" beside the last sync (`useMacStatus`).
- The menu bar is a SwiftBar plugin (`scripts/mac/swiftbar/acadkit.1m.sh`, put in SwiftBar's
  plugin folder by `mac:install`) that runs `menubar.mjs` every minute: the day and the next class
  in the bar ("DO 3 · OS 10:00 AM", "↻" while syncing), and in the menu the day's sentence (the
  one Siri says), the classes (grey once over), and the Mac's line with each job in its
  submenu (from the copy of `jobs.json` the Mac keeps), then Open Today, Sync now and Pause (or
  Resume) Autopilot. Only a failure is coloured. An action runs the plugin again with its name:
  `sync` starts the tick, which holds its own lock, and `pause` leaves `autopilot/paused` in the
  state folder until `resume`. The day's rows are read from Supabase at most every 30 minutes; the
  sync's live state comes from the tick's lock, its last-sync stamp and the log's last verdict.
- Tags (`scripts/lib/tags.mjs`): subject from the top folder's code or course title (curriculum,
  then syllabi, so an elective's folder is found too), unit from the path (none inside a subfolder
  named by another course's code), kind from folder and file name.
- Syllabus units are read from each course's syllabus PDF (`scripts/study-index/syllabus.mjs`).
- Past-paper topics are counted by the syllabus topic each question matches
  (`scripts/study-index/topics.mjs`).
- `topics.json` is an index of subjects naming one file each under `<pin>/topics/`, named by
  content like the Run-up's parts (`splitTopics`, `scripts/lib/parts.mjs`); a subject's page
  loads only its own (`useSubjectTopics`).
- Units and topics take most of a sync, so they are built again only when their inputs change: the
  files and their tags, the syllabi, the search index, or the code that builds them
  (`scripts/lib/derived.mjs`). `--reindex` builds them regardless.
- Search by meaning (pgvector, migration 030): the sync embeds passages, syllabus units and
  past-paper questions on the Mac with gte-small (`scripts/embedder`, a package of its own:
  `npm ci --prefix scripts/embedder` once), and the `study-search` edge function embeds only
  search queries, with the same model and the same vectors. Units and topics find their nearest
  passages in batches of 50 (`match_study_chunks_many`, migration 046;
  `scripts/study-index/search.mjs`). The function also returns the nearest moments of recorded
  lectures (`match_lecture_moments`, migration 061; see Class recorder).

## Autopilot

The Mac's own model reads what reaches the study folder (`scripts/lib/autopilot.mjs`, run by the
tick through `sync:app`): Qwen3-VL 8B through Ollama, on the Mac, with nothing sent anywhere.

- Each photo or PDF in Inbox, and each one saved to a folder in `AUTOPILOT_FOLDERS` after
  Autopilot first saw that folder, is read once, by content hash, three a tick, before Inbox is
  filed. A photo goes as one JPEG (`sips`, HEIC included), a PDF as its
  first page and the text of its first two (Ghostscript). The model says what it is (notice,
  notes, board, slides, question paper, assignment, other), its course, one line, and how sure it is.
- Answers are JSON held to a schema twice: by Ollama as it writes, and by `checkSchema`
  (`scripts/lib/ollama.mjs`). One that still doesn't fit is asked for once more, then refused.
- A sure read (at least 0.7) files an Inbox file by what it shows, in the course it shows or, for
  notes and a board, the class on then: notes and slides to `02_Notes`, a board to
  `02_Notes/Class_Photos/<date>`, a question paper to `07_PYQs`, an assignment to
  `03_Assignments_Tutorials`. A notice or anything else stays in Inbox, even in class hours, and
  a photo or PDF waits there until it is read. Unread three ticks running, it is left to the
  other rules.
- A watched folder's study material is copied into Inbox with its own times, so Inbox's
  class-time rule sees when it arrived. The original stays where it is.
- A notice is read again for its tests and deadlines (`scripts/lib/autopilot-notice.mjs`). The
  new ones (not past, and no deadline for that course on that day already) are added with the
  file as `source`, under one `autopilot_actions` row (migration 053). Today turns it into "Added
  OS FT-II (Thu, 29 Oct) · from notice.jpg" with Undo for three days, and Undo removes the ones
  still pending. A test without a time takes that day's class (`packages/core/src/dueTime.ts`, as
  the deadline sheet suggests).
- A screenshot of the student portal (sent by Back Tap through the AcadKit Screenshot Shortcut)
  is its own kind. Its attendance table is read into `portal_snapshots` and their history with
  source `screenshot` (`scripts/lib/portal-shot.mjs`, migration 058), and its marks table into
  `marks` the way a pasted page's are (`packages/core/src/portalMarks.ts`: onto the test's row,
  the portal's own first). Each row is checked first: a course on the account, no more absences
  than classes, a percentage within 1.5 points of the two, and no mark over what it's out of.
  The screenshot then goes to `_portal/<date>`, which the sync never uploads. Each import leaves
  an `autopilot_actions` row of kind `portal` (migration 059) that says what changed ("OS 75.0%
  (was 73.8%)", "FJ-II 9/15 (new)") and keeps every row as it was; Today shows it with Undo, which
  restores each snapshot and mark and deletes what the import added, its screenshot history too
  (the one history an owner may delete).
- The past-paper reader (`scripts/lib/paper-reader.mjs`) turns a question paper into the fields
  the labelled dataset has: each question's part, number, marks, unit and topic, the topic
  chosen from the course's list in `_src/pyq_dataset/topics.tsv`. It reads a page at a time, as
  text when the PDF has a text layer and as a picture when not, and tells each page the number
  the last one ended on, nothing more: told what that question was worth, or not to count on,
  the model starts climbing the next questions' marks. Told only the number, it sometimes counts
  on past the page instead (A30 to A100 on a page that starts a new set), so the code stops that:
  a page's answer lists 40 questions at most, and a number past 32, which no SRM paper uses, is
  dropped. Slots are tidied in code ("B 21 (a)" is B21a); one read twice keeps its first
  reading, and one that isn't a question number is dropped. A Word paper is read from the PDF the
  sync made of it, and a paper inside a file of several only on its own pages (`only`).
- A question paper Autopilot is sure of is read with that reader, plus its kind, test and month
  off page 1, and joins my dataset when it is filed into `07_PYQs` (`scripts/lib/paper-dataset.mjs`):
  `papers.tsv` and `questions.tsv` get it as I label papers. A reading with doubts (under 10
  questions, a fifth or more without a topic, a gap in the numbers, no date) asks first: a
  suggestion of kind `paper` (migration 060) on Today's "Found in your files", holding the
  reading, which the Mac adds at its next tick once accepted.
- What was read is kept in `~/Library/Application Support/AcadKit/autopilot/seen.json`, and every
  decision (read, copied or left, a notice's deadlines added or not, filed, failed) is a JSON line
  with the model's confidence in `~/Library/Logs/AcadKit/autopilot.jsonl`, moved aside past 2 MB.
  `AUTOPILOT=off` pauses it; without Ollama or the model it waits.

## Class recorder

Lectures I record with Voice Memos on the iPhone reach the Mac through iCloud, and the tick picks
each new one up (`scripts/lib/recorder.mjs`, through `sync:app`). The audio never leaves the Mac.
Setup and privacy are in [docs/recorder.md](docs/recorder.md).

- Off until `RECORDER=on` in `.env.local`: recording a class needs the teacher's say-so.
- Voice Memos keeps its files in `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/
  Recordings`, which macOS guards: the tick's `/bin/bash` needs Full Disk Access, and the step
  says so, once every six hours, when it can't read the folder.
- A memo's start comes from its name (`20261103 101533-….m4a`, the Mac's local time) and its
  length from `afinfo`. One iCloud wrote in the last minute waits; each is handled once, kept in
  `~/Library/Application Support/AcadKit/recorder/seen.json` by name and size.
- Each is matched to its class: the day's classes from core's `today()` (the Day Order calendar
  and the timetable), and the one the recording overlaps most, as long as it covers half the class
  or the class covers half of it (`classOf`). Out of class hours it is no class.
- Then it is transcribed on the Mac (`scripts/lib/whisper.mjs`): `afconvert` makes it 16 kHz mono
  WAV, and whisper.cpp (`brew install whisper-cpp`) runs large-v3-turbo on the GPU through Metal,
  the model at `~/Library/Application Support/AcadKit/whisper/ggml-large-v3-turbo.bin`. The
  language is English unless `RECORDER_LANG` says otherwise (`auto` for a class that mixes in
  Hindi). The timed segments go to `recorder/transcripts/<memo>.json`.
- The transcript is lined up with the class's slides (`scripts/lib/lecture-align.mjs`). It is cut
  into moments of about a minute, embedded with gte-small (the vectors study search uses), and
  matched against each deck under the course's `02_Notes`: every `.pptx` and `.ppt`, and PDFs
  named as slides. The lecture follows the deck its moments match best, and the moments take
  slides in order, never going back (a dynamic program over moments and slides). Moments and
  slides are compared centered: the mean of the course's slides is taken off both, since
  gte-small scores any minute of classroom talk 0.8 or more against any slide. A moment under
  0.2, centered, is talk off the slides and gets none. Slide numbers are the viewer's pages: an
  Office deck is read from its PDF rendition when the sync has made one. Slide vectors are cached
  by the deck's content in `~/Library/Caches/AcadKit/slides`.
- `npm run recorder:eval` measures the alignment on three stand-in lectures, spoken by `say` from
  explanations of real decks, and writes [EVAL.md](EVAL.md): the right deck for all three, 43% of
  moments on the right slide (31% without centering), 51% within a page, 2 of 5 aside moments
  kept off. Neighbouring slides on one topic are what it confuses most.
- Each transcript then goes to the app (`scripts/lib/lecture-sync.mjs`, migration 061): a
  `lectures` row (its class, deck and length) and its `lecture_moments`, each with its text,
  slide and gte-small vector. Whisper's segments and the audio stay on the Mac. A transcript
  is sent again whole when it changes, and a send that fails is tried at the next tick without
  transcribing again. A semester switch clears the lectures with the rest of the old folder.
- `/lecture/:id` is a lecture's transcript (`src/pages/Lecture.tsx`), full screen and able to open
  over the page it came from, like the viewer. Its moments come in runs on one slide, and each
  run's "Slide n" opens the deck in the viewer at that page; `?m=` scrolls to a moment from a
  search. A subject's page lists its recorded lectures (`recorded-lectures.tsx`).
- Study search shows moments a query is at least 0.82 like, above the files (`src/lib/lectures.ts`):
  in a probe, short queries scored 0.82–0.94 on the moments that answered them and at most 0.81
  on the rest. A subject's search shows only its own lectures.
- One memo a tick, since a lecture takes whisper a few minutes; one that fails is tried again at
  the next tick. Without whisper or the model, the step says what's missing and waits.
- `scripts/lib/__fixtures__/lecture-sample.m4a` is an 18-second lecture made with `say`, with
  whisper's JSON for it beside it. `npm test` replays that JSON through the whole step;
  `npm run test:recorder` runs the real afinfo, afconvert and whisper.cpp on this Mac and
  wants under 5% of words wrong.

## Night shift

The Mac's heavy work waits for the night (`scripts/night-shift.mjs`, `scripts/lib/night-shift.mjs`).

- A launch agent (`com.acadkit.nightshift`, installed by `npm run mac:install`) starts it at
  23:00. It holds `caffeinate -s` for as long as it runs. macOS honours that assertion only on
  the charger, so a Mac left plugged in with its lid open stays awake through `pmset sleep 1`
  until the job at 02:00. On battery the Mac sleeps as usual, and a closed lid sleeps either way.
- At 02:00 it checks the charger again (`pmset -g batt`) and skips the night on battery. A Mac
  that slept through the night skips it too, and the agent's late start in the day does nothing.
- One run a night, named by the date the night began, kept in
  `~/Library/Application Support/AcadKit/night-shift.json`. `NIGHT_SHIFT=off` in `.env.local`
  turns it off.
- The job (`scripts/lib/night-job.mjs`) holds the tick's `sync.lock`, waiting up to 15 minutes for
  a tick to finish, and touches it every five minutes so a long night never looks stale. In order:
  1. Transcribe: every recording waiting, not the tick's one, then the transcripts to the app.
  2. Read: every file waiting for Autopilot, not the tick's three; Inbox filed; accepted past
     papers into the dataset. With Autopilot paused it does nothing; with Ollama away it fails.
  3. Sync: the study folder with PDFs over 2 MB shrunk (`--shrink-over=2`; the day's sync shrinks
     those over 8 MB). A shrunk copy smaller than the bucket's replaces it, and the day's sync
     leaves it, so the space stays freed. On Saturday nights it adds `--reindex`.
- A step that fails is recorded and the rest still run. What each did goes into
  `night-shift.json` and the sync log.
- The night's report goes to `<pin>/night-shift.json` in the bucket: a sentence of what it did
  ("2 lectures transcribed; 12 files indexed, 96 MB saved by shrinking.") and the steps that
  failed. `send-reminders` pushes it at 07:00, once a night; a night it skipped, or one with
  nothing to do, sends nothing.

## Everything connected

What I study from and what was said in class share one embedding space (`scripts/lib/connected.mjs`,
`npm run connected`), with the gte-small vectors study search uses, so an item can point at the
others about the same thing.

| Kind | What it is | From |
| --- | --- | --- |
| page | a page of notes | a course's PDFs and documents that aren't decks |
| slide | a slide | a course's decks (`isDeck`, as the recorder's) |
| question | a past-paper question | `_src/pyq_dataset/questions.tsv`, in its paper's course |
| moment | a minute of a recorded lecture | the recorder's transcripts |
| photo | a board photo's writing, by OCR | `02_Notes/Class_Photos` |

- Courses are the top folders the sync tags with a course code; past papers' own PDFs (`07_PYQs`)
  are left out, since their questions stand for them.
- Every item has its course, its unit where its folder or its question's topic says, and a time
  for a moment or a photo. Vectors are cached by content (`~/Library/Caches/AcadKit/slides` and
  `connected/`): the first build of my Sem 3 folder took 19 minutes, and one from cache a second.
  It holds 9,612 items: 3,705 pages, 3,473 slides and 2,434 questions.
- Links by meaning (`scripts/lib/links.mjs`): each item points at the nearest two items of each
  other kind in its course, compared centered on the course's mean as the recorder's slides are,
  and only at 0.40 or more (`BARS`). That bar comes from 100 links judged by reading both ends
  (`npm run connected:judge`, in [EVAL.md](EVAL.md)): 82% of those at 0.40 or more were right,
  10 of 33 below it. A fresh 100 of the links the app shows, judged after the bar was set
  (`-- --fresh`), came out at 73%. Agreeing on the unit (`npm run connected -- --check`) is a weaker check: 80%
  of question links agree on it from 0.23, where most were wrong. My Sem 3 folder gets 21,045
  links on 6,891 items, in 18 seconds.
- Links by time (`linkByTime`): a moment points at the slide on screen then (the recorder's
  alignment), and a board photo at its class's moment nearest when it was taken, and at that
  moment's slide; each of those points back. A photo's class is its course's lecture that day
  whose window holds the photo's time: the class on the timetable when the recording matched
  one, else the recording itself. Time links come first (`mergeLinks`), and every link says why
  it is there, `"time"` or `"meaning"`.
- The sync builds the links with units and topics, when their inputs change (the study files,
  the lecture transcripts, or the code that builds them), and sends them as `<pin>/links.json`
  and a part per course named by its content (`splitLinks`, as topics are split). The app loads
  only the course it shows (`useLinks`). Sem 3's biggest part, DSA's, is 1.5 MB (80 KB gzipped).
- One "Connected" line (`src/components/connected-line.tsx`) shows what links to an item, a chip
  each, time links first: under the PDF page you're on in the viewer (a deck's pages are its PDF's,
  as the Mac numbers them), under each past-paper question on Practice, and under each moment of
  a transcript (without the slide its run already names). Practice lists questions mined from the
  papers, worded a little differently from the labelled ones the links know, so a question is
  matched by its paper's file and at least half its words (`questionFor`). Each part carries what
  an id can't say: a question's paper file, label and text, and a moment's time.
- Each chip opens its item over the page it came from (`hrefOf`): a page or slide in the viewer at
  that page, a board photo in the viewer, a question's paper, a moment in its transcript (found
  by the recording's memo among the synced lectures; a lecture not synced yet is a plain chip).

## Reminders

- `send-reminders` (an Edge Function that `pg_cron` calls every 10 minutes, `cron.sql`) plans the
  pushes that are due and skips any already in `sent_notifications`.
- The function secret `REMINDERS_VIA_JOBQ` decides who delivers them:
  - `off` (the default): the function pushes each one itself.
  - `shadow`: it still pushes, and also queues a do-nothing job per reminder on
    [jobq](https://github.com/KunalShukla-Al/jobq), my Go job queue, to compare the two.
  - `on`: it queues each reminder with `public.jobq_enqueue` (migration 063) and starts jobq's
    Deliver workflow on GitHub Actions (`dispatch.ts`). jobq pushes it, retries a failure with
    backoff, and records it sent only once a browser has it.
- The steps, secrets and rollback are in `supabase/functions/send-reminders/DEPLOY.md`.

## Feeds

What reads AcadKit without signing in (the iPhone's Shortcuts, a calendar subscription) uses a
private token, one per account, in `feed_tokens` (migration 047). The database makes it (48 hex
characters); the app may only insert its PIN, read its own token and delete it, which revokes
it. Every feed request makes one call, `feed_use` (migration 052, service role only), that looks
the token up, refuses it once its PIN has no owner, stamps its last use and counts it against 30
requests a minute; over that the feeds answer 429. Deleting everything in Settings revokes it.
- `supabase/functions/feeds` serves them. `GET /feeds/today?token=…` is the day at a glance from
  core (`packages/core/src/today.ts`): the Day Order or the holiday, the classes with their
  attendance and how many can be skipped, an alarm time, the week's tests (each with its type, and
  `from`, the notice's file name when Autopilot added it), and one sentence. Dates
  are IST: the edge runtime runs on UTC. `GET /feeds/calendar.ics?token=…` is the same account as
  a calendar to subscribe to (`webcal://`): every class from a week back to two months ahead, and
  each pending test and deadline at its due time (`packages/core/src/ics.ts`, which also writes
  the Settings export). `POST /feeds/share?token=…&name=…` takes a file's bytes, for the share
  sheet: they go to the PIN's inbox with a `study_uploads` row for `Inbox/<name>` (or `&folder=…`),
  exactly as the app's Upload does, and the Mac saves them at its next tick. Names follow
  `packages/core/src/uploads.ts`, and the 50 MB cap holds.
- `GET /feeds/ask?token=…&q=…` is Siri's: the question as said, parsed by core's plain-word grammar
  (`packages/core/src/ask.ts`: can I skip, what do I need, next test, I'm absent; loose subject
  names; a little Hinglish) and answered in one sentence from the same rules as the app
  (`answer.ts`). "I'm absent in OS" is the one write: `absent.ts` works out the day's classes (the
  lab's alone when said) and what each was marked before; the feeds mark them absent and keep a
  `siri_marks` row (migration 051) that Today turns into "Siri marked you absent in OS" with Undo.
  Undo puts back only classes still as Siri left them.
- The iPhone's Shortcuts are built on the Mac for the account's token (`scripts/lib/shortcuts.mjs`,
  run by the tick through `sync:app`): AcadKit Alarm sets an alarm an hour before the first class,
  AcadKit Focus (run when that alarm stops, and on arriving at SRM) turns Do Not Disturb on until
  the last class ends, only while one is still ahead (`focusUntil`), and shows the class on now or
  next (`arrive`), AcadKit Leave (run on leaving SRM) asks "Mark the rest absent?" when classes
  are still to come (`leave`) and, on OK, posts to `/feeds/leave`, which marks them like Siri
  does, Undo and all, and AcadKit, in the share sheet,
  posts each shared item to the share feed by name (a photo without an extension gets one from its
  type). Run with nothing shared ("Hey Siri, AcadKit"), the same Shortcut listens, sends what it
  heard to the ask feed, and speaks the sentence back. Each is a plist of actions
  in the format Cherri writes, signed with `shortcuts sign` and uploaded to
  `<pin>/shortcuts/<name>.shortcut`. They are rebuilt when the token changes and taken down when
  it is revoked.
- Settings' iPhone card (`components/settings/iphone-card.tsx`, `src/api/feeds.ts`) turns the token
  on, adds the calendar as a `webcal://` link, offers each Shortcut as a signed download once the
  Mac has built it, copies the today link, and revokes. `handle.ts` is the handler with its database and clock
  passed in, so Vitest runs it. The function imports core from outside `supabase/`, so it deploys
  with `--use-api`, and checks its own token, so with `--no-verify-jwt`.

## Portal sync

A bookmarklet (`scripts/portal-sync/`) scrapes the SRM portal and posts to `portal-ingest`,
signed with `HMAC-SHA256(INGEST_SECRET, pin)`. The parser (`src/lib/portal/parse.ts`) matches
header text, never DOM paths, and also powers Settings, where you paste a portal page.

```bash
supabase secrets set INGEST_SECRET="<long random string>"
supabase functions deploy portal-ingest --no-verify-jwt
node scripts/portal-sync/build.mjs --pin <PIN> --secret "<INGEST_SECRET>"
```
