# What export and reset cover

Settings → Data has two buttons that claim to cover the whole account:

- **Export everything as JSON** runs `exportAllData` (`src/api/account.ts`).
- **Reset all data** runs `deleteAllData` (`src/api/account.ts`), then `seedAccount`. Its dialog is titled "Delete everything?" and lists "Subjects, attendance, marks, deadlines, past semesters and settings on this account". The toast after it says "Everything wiped".

This page records what each one reaches. It is the baseline for blocker 9 and PR slice 5 in [v2.md](v2.md).

As of 27 Nov 2026: `main` at `0975f41`, migrations through `064`. Policies were read from the live database.

## Tables

Every table is keyed by `device_id` (the PIN). "App may delete" is the signed-in user's RLS delete right; the service role bypasses it.

### The ten export sections

| Table | Export | Reset | App may delete | Written by | Created in |
| --- | --- | --- | --- | --- | --- |
| `settings` | yes | yes | yes | app | 001 |
| `subjects` | yes | yes | yes | app, Mac sync | 001 |
| `timetable_slots` | yes | yes (also cascades from `subjects`) | yes | app | 001 |
| `attendance` | yes | yes (also cascades) | yes | app, Mac sync | 001 |
| `marks` | yes | yes (also cascades) | yes | app | 001 |
| `deadlines` | yes | yes | yes | app, Mac sync | 001 |
| `semester_archives` | yes | yes | yes | app | 010 |
| `portal_snapshots` | yes | yes (`clearPortalSnapshots`) | yes | Mac sync, screenshots | 012 |
| `portal_snapshot_history` | yes | **no** | only `source = 'screenshot'` rows (059) | Mac sync | 029 |
| `forecast_log` | yes | **no** | no delete policy | app | 029 |

### Other rows the app or the Mac keeps per account

| Table | Export | Reset | App may delete | Written by | Created in |
| --- | --- | --- | --- | --- | --- |
| `plan_ticks` | **no** | **no** | yes | app (`src/api/runup.ts`) | 043 |
| `syllabus_progress` | **no** | **no** | yes | app (`src/api/units.ts`) | 034 |
| `active_days` | **no** | **no** | insert only | app (`src/lib/activity.ts`) | 039 |
| `reading_now` | **no** | **no** | no | app, Mac (`scripts/mac/send-to-phone.mjs`) | 062 |
| `push_subscriptions` | **no** | **no** | yes | app (`src/api/push.ts`); read by `send-reminders` | 011 |
| `suggestions` | **no** | **no** | no | Mac (`scripts/sync-study-folder.mjs`) | 026 |
| `study_uploads` | **no** | **no** | yes | app queues, Mac applies | 033 |
| `study_file_deletions` | **no** | **no** | yes | app queues, Mac applies | 032 |
| `feed_tokens` | no (a secret) | yes | yes | app | 047 |
| `device_owners` | no | no (keeps the PIN signed in) | yes | app (`src/lib/auth.ts`) | 014 |

### Derived or operational

| Table | Export | Reset | App may delete | Written by | Created in |
| --- | --- | --- | --- | --- | --- |
| `study_chunks` | no (rebuilt from files) | **no** | no | Mac index (`scripts/study-index/index.mjs`) | 030 |
| `error_log` | no | no | insert only | app (`src/lib/crashLog.ts`) | 009, 064 |
| `sent_notifications` | no | no | no policy; service role only | `send-reminders` | 011 |

### Unused since PR #49

No code reads or writes these. They remain from removed features: Autopilot, the lecture recorder, flashcards and Siri.

| Table | Rows (27 Nov) | Created in |
| --- | --- | --- |
| `autopilot_actions` | 1 | 053 |
| `card_reviews` | 0 | 045 |
| `siri_marks` | 0 | 051 |
| `lectures`, `lecture_moments` | 0 | 061 |

## Storage

Bucket `study-files` (025), one folder per PIN.

| Path under `<pin>/` | Holds |
| --- | --- |
| `blobs/` | every study file |
| `manifest.json` | the file list the app reads |
| `units.json`, `syllabi.json`, `curriculum.json`, `prereqs.json`, `prep.json`, `quiz.json` | course data the Mac builds |
| `jobs.json`, `heartbeat.json`, `night-shift.json`, `storage.json`, `semester-switch.json` | Mac status |
| `inbox/` | uploads and asks from the phone |

- Only the Mac writes, with the service role. The app may insert and delete under `<pin>/inbox/` and nowhere else (033).
- Export includes no files. Reset deletes no files.

## On this device

Reset calls `qc.resetQueries()` and nothing else on the device. `resetAfterSignOut` (`src/lib/accountReset.ts`) only runs on sign-out, so after a reset:

- tomorrow's offline downloads stay (`clearTomorrow`)
- files opened on this device stay (`clearFileCache`)

## What "everything" misses

- Export leaves out Run-up ticks, syllabus ticks, active days, the reading handoff, suggestions, the upload and deletion queues, and all files. Leaving out the feed token, `device_owners`, `study_chunks`, `error_log` and `sent_notifications` is right.
- Reset leaves the two histories, the same rows export misses, push subscriptions, the search index and all files. The app can't delete the histories under RLS, so a full reset needs the service role (an edge function or a `security definer` function).
- The dialog's list is accurate, but its title "Delete everything?" and the toast "Everything wiped" overclaim.
- Wrapped's new-semester clear (`clearAcademicData`) is narrower by design. When the folder moves on, the Mac's `clearOldSupabase` (`scripts/lib/semester.mjs`) removes the histories, the queues and their inbox copies, suggestions, syllabus ticks for courses that are gone, and stale chunks.
