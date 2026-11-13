# Campus automations

The parts of the iPhone setup that live in iOS rather than in a Shortcut: the automations that
run the Shortcuts when I wake up and arrive at SRM. Install the Shortcuts first, and run each
once by hand ([docs/shortcuts.md](shortcuts.md)).

## Waking up: the alarm and Focus

In Shortcuts → Automation, **+**:

| Automation | Trigger | Runs | Setting |
| --- | --- | --- | --- |
| The first-class alarm | Time of Day, 5:00 AM, daily | AcadKit Alarm | Run Immediately |
| Class hours | Alarm, **Is Stopped**, **Any** alarm | AcadKit Focus | Run Immediately |

The alarm is a new one each class day, so the second automation watches any alarm rather than one
picked from the list. On a day without classes ahead, Focus turns nothing on.

## Arriving at SRM

| Automation | Trigger | Runs | Setting |
| --- | --- | --- | --- |
| Arriving | Arrive, at SRM KTR (pick the campus on the map), any time | AcadKit Focus | Run Immediately |

- Draw the place around the whole campus. iOS fires a location automation when the iPhone crosses
  the edge, a few minutes either way, and a small circle around one building misses days.
- Location automations need Location Services on for Shortcuts (Settings → Privacy & Security →
  Location Services → Shortcuts).

## Checking it works

- After the first morning, the Clock app shows "AcadKit · first class", and Do Not Disturb turned
  on when it was stopped.
- Settings → iPhone and calendar (from the corner) shows when the link was last used.
- If an automation shows a notification asking to run, its **Run Immediately** is off.

I've set this up from the actions the Shortcuts contain and iOS's automation settings, not on a
freshly set up iPhone.
