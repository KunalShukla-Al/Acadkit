# Autopilot

Autopilot reads the photos and PDFs that reach my study folder's Inbox, and the folders I pick,
with a vision model running on my Mac. Study material gets filed into the right course, and a
notice's tests and deadlines get added to the app. Nothing it reads leaves the Mac.

## Setup

1. Install Ollama and start it at login:
   ```bash
   brew install ollama
   brew services start ollama
   ```
2. Pull the model (5.9 GB on disk; Ollama unloads it after 10 idle minutes):
   ```bash
   ollama pull qwen3-vl:8b-instruct
   ```
3. Install Ghostscript for PDFs (`brew install ghostscript`). Photos need nothing extra: `sips`
   comes with macOS and handles HEIC.
4. Optional, in `.env.local`:
   ```bash
   AUTOPILOT_FOLDERS="~/Downloads, ~/Desktop/WhatsApp"   # folders to watch
   AUTOPILOT=off                                         # turn it off
   ```
   The watcher re-reads `.env.local` every 3 minutes, so nothing needs restarting. To pause it for a
   while instead, use Pause Autopilot in the menu bar.

Autopilot runs inside the tick's `npm run sync:app`, so nothing else needs starting. With Ollama
stopped or the model missing, it waits, and Inbox files by name and class time as before.

## What it does with a file

| It reads a…    | What happens                                                       |
| -------------- | ------------------------------------------------------------------ |
| Notice         | Tests and deadlines on it are added, with Undo on Today; file stays in Inbox |
| Notes, slides  | `<Course>/02_Notes`, in `Unit_<n>` when the name says one          |
| Board photo    | `<Course>/02_Notes/Class_Photos/<date>`                            |
| Question paper | `<Course>/07_PYQs`, and into the past papers; one it isn't sure of asks on Today first |
| Assignment     | `<Course>/03_Assignments_Tutorials`                                |
| Portal page    | Its attendance or marks go into the app; the screenshot to `_portal/<date>` |
| Anything else  | Stays in Inbox                                                     |

- A course named in the file's name still decides first.
- A board photo or notes with no course on them go to the class on at the time.
- Filing needs the model at least 0.7 sure. Below that, the file is left to the name and
  class-time rules.
- A file it can't read is tried for three ticks, then left to the other rules.
- From a watched folder, only photos and PDFs saved after Autopilot first saw the folder are read,
  and only at its top level. Study material is copied into Inbox; the original is never moved or
  changed.

## Privacy

- The model runs locally through Ollama (`127.0.0.1:11434`). Files are never uploaded to be read.
- My Supabase project gets only what it adds: each deadline (title, course, date, and the file's
  name as its source), plus one row per notice with a line saying what was added and how sure the
  model was.
- The Mac keeps two files:
  - `~/Library/Application Support/AcadKit/autopilot/seen.json`: for each file it read, the name,
    kind, course, one-line summary and confidence.
  - `~/Library/Logs/AcadKit/autopilot.jsonl`: every decision, with its confidence.
- Deleting those two paths forgets it all. The deadlines stay until I remove them.

## Checking on it

- The sync log (`~/Library/Logs/AcadKit/study-sync.log`) has an `Autopilot:` line for each file.
- `tail -f ~/Library/Logs/AcadKit/autopilot.jsonl` shows each decision as it happens.
- Today shows what was added from a notice, with Undo for three days. A deadline's sheet names the
  file it came from.

## Speed

On my Mac a photo takes 5 to 10 seconds once the model is loaded, and a notice 25 to 45 (it is
read twice: what it is, then its dates). Loading the model adds about 20 seconds to the first
file of a batch. Three files are read per tick; the rest wait for the next one.

## Changing the prompts

The prompts live in `scripts/lib/autopilot.mjs` and `scripts/lib/autopilot-notice.mjs`. After
changing one, or the model, run `npm run autopilot:record` with Ollama up. It asks the model about
six of my files and saves only its JSON replies to `scripts/lib/__fixtures__/autopilot-replies.json`.
Then `npm test` shows what changed, through `scripts/lib/autopilot.replay.test.ts`.

## Questions

**It filed something into the wrong course. How do I fix it?**
Move the file in Finder; the next sync uploads it from its new place. Autopilot reads each file
once, by its content, so it won't move it back. To stop the mistake recurring, put the course's
code or short name in the file's name: a name beats the model.

**It added a deadline that's wrong.**
Today offers Undo for three days. After that, delete it from Today → Deadlines; its sheet names
the notice it came from.

**It didn't touch a file I saved.**
Most often the file is one it doesn't watch: a watched folder is read only at its top level, and
only for photos and PDFs saved after Autopilot first saw the folder. Then check the sync log for
an `Autopilot:` line with the file's name. A file it couldn't read three times is left to the
name and class-time rules, and one under 0.7 confidence is too.

**Does it work while the Mac is asleep?**
No, but nothing is lost. A file shared from the iPhone waits in the app's Inbox in Supabase, and
the Mac reads it at the first sync after waking. The night shift reads whatever is still waiting
at 02:00.

**Does anything go to an AI service?**
No. The model runs in Ollama on the Mac, and nothing in AcadKit holds a key to a model API
([ADR 0002](adr/0002-ai-stays-local.md)). Supabase gets only the deadlines it adds and a line
saying what it read.

**How much of the Mac does it take?**
About 5.5 GB of memory while the model is loaded, which Ollama frees after 10 idle minutes, and
5.9 GB on disk. On my 16 GB Mac, the rest of the day's work carries on beside it.

**Can it use a different model?**
The model is set in `scripts/lib/ollama.mjs` (`MODEL`). Pull the new one, change the name, and run
`npm run autopilot:record` and `npm run autopilot:eval` to see how it does. The replies and the
scores come from qwen3-vl:8b-instruct, so expect them to change.

**How good is it at past papers?**
[EVAL.md](../EVAL.md) has it measured on 118 papers I labelled by hand. A paper it isn't sure of
asks on Today before it joins the past papers.

**What's the difference between Pause and off?**
Pause Autopilot in the menu bar stops it until I resume it there. `AUTOPILOT=off` in `.env.local`
turns it off until I take the line out. Either way, Inbox still files by name and class time.
