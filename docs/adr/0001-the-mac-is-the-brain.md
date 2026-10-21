# 0001. The Mac is the brain

- Status: accepted, 15 Nov 2026
- Covers: the study sync, Autopilot, the class recorder, Everything connected, the night shift

## The problem

Most of what makes AcadKit useful is heavy, private work on my own files:

- reading a study folder of about a gigabyte: PDFs, slides, scans, WhatsApp exports;
- embedding every page and slide for search and for links by meaning;
- reading photos and PDFs of notices with a vision model (Autopilot), and every past paper;
- transcribing lectures with whisper and lining them up with the day's slides.

It has to cost nothing. Supabase's free tier gives me a database, 1 GB of storage and edge
functions with a small CPU budget per call; I have no budget for cloud compute or paid model
APIs. And what it reads is mine: my notes, photos of the board, my voice and my teachers' in a
lecture.

## What I chose

My Mac does every heavy or private job, on its own schedule, and the cloud only stores and serves
what it works out:

- A launch agent runs the sync when the folder changes (a file watcher, with a 10-second quiet
  window); Autopilot and the recorder run in the same tick; the night shift runs the long jobs at
  02:00 on the charger.
- Models run locally: gte-small for embeddings (`scripts/embedder`), qwen3-vl through Ollama for
  Autopilot and the past papers, whisper.cpp for lectures.
- The Mac uploads files and their results (the manifest, links, topics, prep, transcripts) to the
  study-files bucket, and writes rows with the service key.
- The app on the phone and the Mac's browser reads those, and asks the Mac for work through rows
  (deletes, uploads, a semester switch) that the next tick carries out.
- Edge functions do only what must answer while the Mac is asleep: the feeds the iPhone's
  Shortcuts and Siri call, the reminders, the portal bookmarklet's ingest, and embedding a search
  query (the passages were embedded on the Mac).

## Why not the alternatives

- **Paid model APIs from the cloud**: cost money I don't have, and send my notes, photos and
  lecture audio to a third party.
- **Edge functions for the heavy work**: the per-call CPU budget is too small. Embedding passages
  there ran out of it on some calls (18 Oct: 7 of 44 study-search calls), which is why the Mac
  embeds them now and the function embeds only the query.
- **Models in the browser or on the phone**: an 8B vision model and whisper large don't fit a
  phone's memory or battery, and a tab can't watch a folder.

## What it costs

- **The app is as fresh as the Mac's last run.** With the Mac off, nothing new arrives. Today's
  Mac line says when each job last ran, Study warns after a day without a sync, and a reminder
  goes out at 20:00 when the Mac has been quiet for a day.
- **It's one person's design.** The Mac, its folder and its models are mine; another student would
  need their own Mac set up the same way.
- **Setup is real work**: launch agents (`npm run mac:install`), Ollama and its model, whisper.cpp,
  Full Disk Access for the tick, and the charger for the night shift.
- **Some waits are a tick long**: a file shared from the phone reaches its course folder at the
  next sync, not at once.
- **CI can't run the models.** The evaluations run on this Mac (`EVAL.md`), and the tests replay
  recorded model replies.
- **This Mac has 16 GB**, so the heavy jobs take turns: running the local database, the embedding
  build, whisper and the vision model together sent it into swap (19 Oct), and model evaluations
  run with the local database stopped.
