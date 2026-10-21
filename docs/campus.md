# Back Tap and campus automations

The parts of the iPhone setup that live in iOS rather than in a Shortcut: Back Tap, and the
automations that run the Shortcuts when I wake up, arrive at SRM and leave. Install the Shortcuts
first, and run each once by hand ([docs/shortcuts.md](shortcuts.md)).

## Back Tap

A double tap on the back of the iPhone sends what's on screen to AcadKit.

1. Settings → Accessibility → Touch → Back Tap → **Double Tap** → **AcadKit Screenshot**.
2. Take a screenshot (side button and volume up), then double-tap the back. The Shortcut sends the
   latest screenshot to the study folder's Inbox.
3. A screenshot of the portal's attendance or marks page is read into the app at the Mac's next
   sync (below); anything else is filed like a shared photo.

Setting **Triple Tap** to Screenshot (also under Back Tap) makes it a two-gesture habit: triple tap,
then double tap.

## Portal screenshots

A screenshot of the portal's attendance page or its marks page, sent with Back Tap, updates the
app without a paste.

1. **Sent.** AcadKit Screenshot sends the latest screenshot to the study folder's Inbox, like a
   share.
2. **Recognised.** At the Mac's next sync, Autopilot looks at it. Only a screenshot it's at least
   0.7 sure is the portal's attendance or marks table is read as one; anything else is filed like
   a photo.
3. **Read.** The model reads the table: for attendance, each course's code, hours conducted,
   hours absent and the percentage shown; for marks, each test's name, marks and what it's out of.
   It also says how sure it is of the numbers, and below 0.7 nothing is imported.
4. **Checked.** Each row is checked before it's written. A row is left out when:
   - the course isn't one of mine;
   - it shows more absences than classes;
   - its percentage is more than 1.5 points from what its hours give;
   - a mark is more than it's out of.
5. **Written.** Attendance goes in as a portal sync would, marked as coming from a screenshot in
   its history. Marks land as a paste's do: a test I typed in by hand is updated, not doubled.
6. **Shown, with Undo.** Today says what changed, course by course against what it was
   ("attendance OS 64.6% (was 66.0%), DSA 75.0% (new)"), with Undo. Undo puts every row back
   exactly as it was. The sync log has the same line, and names each row left out and why.

The screenshot is filed into `_portal/<date>` in the study folder, so I can check it against what
was read.

### When it doesn't take

- **Nothing changed.** The sync log's `Autopilot:` line says why: not recognised as the portal,
  not sure enough of the numbers, or no row matched my courses.
- **One course is missing.** Its row failed a check; the log names it. A screenshot cut off at the
  edge is the usual cause, so take it with the whole table on screen.
- **A number is wrong.** Undo on Today, then paste the page instead (Settings → Paste a
  portal page), which reads the page's own text rather than a picture of it.

## Waking up: the alarm and Focus

In Shortcuts → Automation, **+**:

| Automation | Trigger | Runs | Setting |
| --- | --- | --- | --- |
| The first-class alarm | Time of Day, 5:00 AM, daily | AcadKit Alarm | Run Immediately |
| Class hours | Alarm, **Is Stopped**, **Any** alarm | AcadKit Focus | Run Immediately |

The alarm is a new one each class day, so the second automation watches any alarm rather than one
picked from the list. On a day without classes ahead, Focus turns nothing on.

## Arriving at and leaving SRM

| Automation | Trigger | Runs | Setting |
| --- | --- | --- | --- |
| Arriving | Arrive, at SRM KTR (pick the campus on the map), any time | AcadKit Focus | Run Immediately |
| Leaving | Leave, at the same place, any time | AcadKit Leave | Run Immediately |

- Draw the place around the whole campus. iOS fires a location automation when the iPhone crosses
  the edge, a few minutes either way, and a small circle around one building misses days.
- Leave asks before it marks anything ("Mark the rest absent?"), and only with classes still to
  come. Cancel stops it. Today can undo what it marked.
- Location automations need Location Services on for Shortcuts (Settings → Privacy & Security →
  Location Services → Shortcuts).

## Checking it works

- After the first morning, the Clock app shows "AcadKit · first class", and Do Not Disturb turned
  on when it was stopped.
- Settings → iPhone and calendar (from the ball) shows when the link was last used.
- If an automation shows a notification asking to run, its **Run Immediately** is off.

I've set this up from the actions the Shortcuts contain and iOS's automation settings, not on a
freshly set up iPhone.
