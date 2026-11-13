# Night shift

My Mac does the long jobs while I sleep: re-indexing and shrinking scans. At 07:00 my phone gets one notification saying what it
did. The day's sync keeps running as it does; the night only takes the work that would make a
daytime tick slow.

## What it needs

- **The charger, and the lid open.** The night shift keeps the Mac awake with `caffeinate -s`,
  which macOS honours only on the charger. On battery, or with the lid shut, the Mac sleeps as
  usual and the night is skipped. Nothing in the Energy settings has to change: my Mac sleeps
  after a minute idle (`pmset sleep 1`), and the assertion holds it awake anyway.
- **The Mac awake at some point after 23:00.** The launch agent starts at 23:00, or at the first
  wake after it. A Mac asleep from the evening until morning skips the night. To wake it for
  the night, schedule a wake for every day:
  ```bash
  sudo pmset repeat wake MTWRFSU 23:00:00
  pmset -g sched        # shows the schedule; sudo pmset repeat cancel removes it
  ```
- **Installed** with `npm run mac:install`, which adds `com.acadkit.nightshift` beside the sync's
  launch agents.

## A night, step by step

1. **23:00.** The agent starts. On the charger, the Mac stays awake until 02:00.
2. **02:00.** It checks the charger again and skips the night on battery. Then it takes the
   sync's lock, waiting up to 15 minutes for a tick to finish, so the two never run at once.
3. **Sync.** The study folder, with PDFs over 2 MB shrunk for upload (a day's sync shrinks those
   over 8 MB). On Saturday nights it rebuilds the search index too.
4. **07:00.** The notification: "Overnight on your Mac: 12 files indexed, 96 MB saved by
   shrinking." A step that failed is named, and the sync log says why. A night
   that was skipped, or had nothing to do, sends nothing.

It runs once a night; a late start in the day does
nothing.

## Checking on it

- **The menu bar** shows when the night shift last ran. **Study** says so when it failed.
- **The sync log**, `~/Library/Logs/AcadKit/study-sync.log`, has a line for each step.
- **The last night** is in `~/Library/Application Support/AcadKit/night-shift.json`: what it did,
  or why it skipped (`on battery`, `asleep`, `sync running`, `not set up`).

## Turning it off

`NIGHT_SHIFT=off` in the repo's `.env.local`. The agent still starts at 23:00 and stops at once.
To remove it, `launchctl bootout gui/$(id -u)/com.acadkit.nightshift` and delete
`~/Library/LaunchAgents/com.acadkit.nightshift.plist`.
