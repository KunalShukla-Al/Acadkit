# The iPhone's Shortcuts

Five Shortcuts connect my iPhone to AcadKit outside the app: an alarm before the first class, Do
Not Disturb through class hours, marking the rest of the day absent when I leave, sending files and
screenshots to the study folder, and Siri. My Mac builds and signs them for my account
(`scripts/lib/shortcuts.mjs`), and Settings offers them to install.

## Before any of them

1. In the app, tap the corner, then Settings → iPhone and calendar, and tap **Turn on**. This makes a private
   link to my timetable, attendance and tests (a token, migration 047). Anyone with it can read
   those, so it stays on my devices. **Revoke** there ends it, and the Mac takes the Shortcuts down.
2. Keep the Mac on for a few minutes. It builds the five Shortcuts for the new link, signs them, and
   Settings shows a button for each.
3. On the iPhone, tap each button, then **Add Shortcut**.
4. Run each one once from the Shortcuts app, and tap **Always Allow** at every question: to connect
   to the feed, to set an alarm, to turn on Do Not Disturb, to use the microphone. An automation
   can't answer a question, so on a new phone it stops at the first one.
5. Allow notifications for Shortcuts (Settings → Notifications → Shortcuts). Focus and Leave say
   what they did in one.

If I revoke the link and turn it on again, the token changes: the Mac rebuilds the Shortcuts, and I
install them again from Settings. A change to the code that builds a Shortcut rebuilds it the same
way, after the Mac pulls it.

## AcadKit Alarm

| | |
| --- | --- |
| Does | On a day with classes, sets an alarm an hour before the first one, named "AcadKit · first class". |
| Run from | A personal automation: Time of Day, 5:00 AM, daily, **Run Immediately**. |
| Asks for | Connecting to the feed; the Clock. |
| Reads | `GET /feeds/today` (the `alarm` field; absent on a day without classes). |

Each class day it adds that day's alarm, and iOS turns it off once it has rung. Old ones stay in the
Clock app's list until I delete them.

## AcadKit Focus

| | |
| --- | --- |
| Does | Turns on Do Not Disturb until the last class ends, and says the day from where I stand: the class on now, or the next. After the last class it only says so. |
| Run from | Two automations, both **Run Immediately**: when **any** alarm is stopped, and on arriving at SRM ([campus automations](campus.md)). The Alarm Shortcut makes a new alarm each day, so the automation can't pick it by name; Focus does nothing on a day without classes ahead, so any alarm is safe. |
| Asks for | Connecting to the feed; Do Not Disturb; notifications. |
| Reads | `GET /feeds/today` (`focusUntil`, `arrive`). |

## AcadKit Leave

| | |
| --- | --- |
| Does | With classes still to come today, asks "Mark the rest absent?" and, on OK, marks them. Today can undo it. Cancel stops it there. |
| Run from | An automation on leaving SRM ([campus automations](campus.md)). |
| Asks for | Connecting to the feed; notifications. |
| Reads, writes | `GET /feeds/today` (`leave`), then `POST /feeds/leave`. |

## AcadKit

| | |
| --- | --- |
| Does | In the share sheet: sends what I share (photos, PDFs, any file) to the study folder's Inbox, where the Mac files it at its next sync. Run with nothing shared ("Hey Siri, AcadKit"), it listens, answers and speaks. |
| Run from | The share sheet, or Siri. |
| Asks for | Connecting to the feed; for Siri, the microphone and speech recognition. |
| Reads, writes | `POST /feeds/share`; `GET /feeds/ask`. |

Siri understands: "can I skip OS", "what do I need in DSA", "what do I need for an A in OS", "when
is my next test", "I'm absent in OS". The answers use the app's own words (`packages/core/src/answer.ts`).

## AcadKit Screenshot

| | |
| --- | --- |
| Does | Sends the latest screenshot the same way. A portal attendance or marks page is read into the app at the Mac's next sync ([portal screenshots](campus.md#portal-screenshots)). |
| Run from | Back Tap ([setup](campus.md#back-tap)). |
| Asks for | Connecting to the feed; Photos. |
| Writes | `POST /feeds/share`. |

## When one doesn't work

Run the Shortcut by hand from the Shortcuts app first. What it shows, or says, points to one of
these.

### It asks a question, or stops without one

| What I see | Why | Fix |
| --- | --- | --- |
| An automation does nothing | A permission question is waiting, and an automation can't answer one | Run the Shortcut by hand and tap **Always Allow** at each question |
| A notification asks to run the automation | Its **Run Immediately** is off | Shortcuts → Automation → the automation → **Run Immediately** |
| Settings' install buttons keep spinning | The Mac hasn't built the Shortcuts for this link yet | Keep the Mac awake; the menu bar's **Sync now** starts the build |

### The feed answers with an error

| It says | Why | Fix |
| --- | --- | --- |
| `unknown token` | The link was revoked, or turned off and on again, which changes it | Install the Shortcuts again from Settings → iPhone and calendar |
| `too many requests, try again in a minute` | More than 30 calls in a minute on one link | Wait a minute. An automation running in a loop is the usual cause |
| `over 50 MB` | Share takes files up to 50 MB | Send it from the Mac, or save it to the study folder |
| `empty file` | The share sheet handed over nothing | Share the file itself, not a link to it |

### It runs, but not as expected

- **No alarm on a class day.** The Alarm Shortcut sets one only when the day has classes. Check
  the day in the app: a declared holiday or a day outside the semester has none. The alarm's
  name is "AcadKit · first class".
- **Do Not Disturb didn't turn on.** Focus turns it on only while a class is still ahead. Stopping
  the alarm after the last class, or on a day without classes, does nothing, as it should.
- **Leave didn't ask.** It asks only with classes still to come today. Location automations also
  need Location Services on for Shortcuts.
- **A shared file isn't in the study folder yet.** It waits in the app's Inbox until the Mac's next
  sync, which can be hours if the Mac is asleep. Nothing is lost meanwhile.
- **Siri answers "I can tell you if you can skip a class…"** It didn't recognise the question. It
  understands "can I skip OS", "what do I need in DSA", "what do I need for an A in OS", "when is
  my next test" and "I'm absent in OS", and the names I use for subjects.

### Checking the link itself

- Settings → iPhone and calendar (from the corner) shows when the link was last used. A time that doesn't
  move when I run a Shortcut means it never reached AcadKit: the iPhone's connection, or a Shortcut
  still holding an old link.
- The calendar subscription is the same link. If the calendar stops updating too, the link is the
  problem; if only one Shortcut fails, that Shortcut is.

I build and sign these on my Mac and have read every action, but I haven't installed them on a
freshly set up iPhone; the steps above are what that needs on paper.
