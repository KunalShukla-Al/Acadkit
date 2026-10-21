# Changelog

All notable changes to AcadKit are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a major version for changes that break
existing data or installs, a minor version for new features, a patch version for fixes.

## [Unreleased]

### Changed

- The ball is now the corner: a lime quarter-disc fixed in the bottom-right corner, on top of the
  tab bar, showing today's Day Order. Tapped, the same stickers burst out of it, and it turns into
  their close button.
- With an expected end-sem set, a subject's card on Marks says what's left for the tests ("With
  31 expected in the end-sem, that's 15.5 of the 25 in the tests - 62% of them"), and its
  explainer shows the step.
- Timetable's Add class sits beside the heading.
- Today opens with a greeting by the hour, "you're awake" to "still up?", under a struck-out
  "welcome back, scholar".

### Fixed

- The AcadKit Focus and AcadKit Shortcuts stopped with "an action could not be found": two of
  their actions were missing their full name. The Mac now rebuilds a Shortcut whenever the code
  that builds it changes.
- Attendance's forecast showed one skip budget pooled across every subject, which could offer
  skips while one subject was already short. SRM counts each course on its own, so it now shows
  the fewest any subject can spare, and which subject that is.
- A subject's skips were never capped at the classes left ("skip 13 more of the remaining 5"),
  which also hid the date it was safe to skip everything up to.
- Skips asked for one class too many on medical leave: 0.65 × 100 came out a hair above 65.
- Add to Home Screen on iOS 26 still drew a letter instead of the icon. The touch icon now sits in
  the page as a data URI, so the sheet needs no fetch; each manifest icon has one purpose, since
  iOS passes over "any maskable"; and the `-180x180` names iOS also asks the site for are real
  PNGs.

## [1.0.0] - 2026-10-21

The first release: attendance, marks, the Day Order timetable and my study files, on the phone
and the Mac, with the Mac doing the heavy work on models that run on it.

### Added

#### The app

- Five tabs. Today has the day's classes, then what's due, and above them only what needs me.
  Timetable has each Day Order's classes. Attendance and Marks each have their number and their
  subjects. Study has my notes folder, search and the viewer. A phone switches tabs from a bar I
  can swipe, a Mac from a sidebar.
- The Run-up sits in the top bar as a chip that counts the day's targets. A lime ball on the
  screen's edge shows today's Day Order; tapped, the calendar, the days I can skip, flashcards,
  past semesters and settings burst out of it as stickers. It drags to either edge.
- Attendance: how many classes each subject can spare, what it takes to get back above the bar
  (75%, or 65% with medical leave), a forecast, and a heatmap of the semester.
- Marks: what each remaining test has to return for the grade I want, with expected marks, the
  predicted SGPA and the odds of each grade.
- The timetable and calendar follow SRM's 5-day rotating Day Order, with holidays I declare.
- The Run-up: a day-by-day plan to the last end-sem, with each day's targets to tick, and a page
  for every test: the target, how it's marked, past-paper questions by unit, and what to read.
- Show your work: tap a number (classes to spare, marks needed, the predicted SGPA) and a short
  animation plays how it was worked out, with captions and an optional voice spoken on the
  device. It saves as a video, and reduced motion gets stills.
- Study: my notes folder from the Mac, search inside files and lectures, and a viewer for PDF,
  Word, PowerPoint, spreadsheets and code. Under each page, one line says where else the same
  idea turns up: a slide, a past-paper question, a moment in a lecture, a board photo.
- Flashcards from past papers, on a Leitner schedule, opened from the ball, which counts the
  cards waiting.
- Portal data in one paste: attendance, marks and the timetable from the SRM portal, and a
  bookmarklet that copies every subject's marks at once. No password is kept.
- Continue on the other device: the page I was reading on the phone opens at that page on the
  Mac, and the other way round.
- Tomorrow offline: in the evening, tomorrow's class and test files download, and Settings says
  when they're ready.
- Reminders before classes and deadlines, and a low-attendance alert.
- Works offline as an installable app, and syncs across devices when signed in.
- A loud look: lime on near-black or near-white, oversized lowercase titles in Chakra Petch, and
  copy that talks back ("currently trapped", "30 min of your life left"). Light and dark, with
  OLED black as the quiet choice.

#### On the Mac

- The sync mirrors my study folder to the app within about 15 seconds of a change, shrinks big
  scans for upload, and keeps the bucket under its 1 GB.
- Autopilot reads what I share or download with a vision model on the Mac (Qwen3-VL in Ollama):
  a notice becomes tests and deadlines I can undo, notes and board photos are filed by course
  and the class they were taken in, and past papers are read question by question.
- The class recorder transcribes lectures recorded in Voice Memos with whisper.cpp, lines them
  up with the day's slides, and makes what was said searchable. The audio stays on the Mac.
- The night shift does the long jobs at 02:00 on the charger, and a morning notification says
  what it did.
- The instant link: a delete, upload or share on the phone reaches the Mac in about a second,
  and the phone shows whether the Mac is awake, syncing or asleep.
- The menu bar shows the day, the next class and how each job went, with Sync now, Open Today
  and Pause Autopilot.
- Finder → Quick Actions → Send to AcadKit phone.

#### On the iPhone

- Shortcuts my Mac builds for my account: an alarm before the first class, Do Not Disturb
  through class hours, a question before marking the rest of the day absent when I leave
  campus, and sending files and screenshots to the study folder.
- Hey Siri, AcadKit: "can I skip OS", "what do I need in DSA", "when is my next test", "I'm
  absent in OS".
- Back Tap: a screenshot of the portal's attendance or marks page updates the app.
- Every class, test and deadline in the iPhone's Calendar, as a subscription.
- All of it through one private link I can revoke.

#### Underneath

- `packages/core` holds the rules (dates, the Day Order calendar, attendance, grades, the marks
  plan, Siri's grammar), and the app, the feeds function and the Mac all use it.
- Row-level security on every table, checked by pgTAP tests.
- The parts that run a model are measured against answers I know, in `EVAL.md`.
- Unit, browser, accessibility, screenshot and Lighthouse checks; the browser tests also run as
  an iPhone and as a Mac in Safari's engine.
- Migrations and functions deploy from CI after a merge, once approved.
- Decision records in `docs/adr`, a security policy, and a pre-commit hook.
