# How the instant Mac link works

When I delete a file, upload one or share one from the phone, my Mac acts on it within a second
or two instead of at its next 3-minute check. The phone also shows whether the Mac is awake,
syncing or asleep. Both run over one private channel between the Mac and AcadKit.

## The path a request takes

1. **The phone writes the request.** A delete goes into `study_file_deletions`, and an upload or a
   share into `study_uploads`, as they always did.
2. **The database tells the Mac.** A trigger on each of those tables sends one message on my
   private Realtime Broadcast channel, `mac:<pin>`, for each insert (migration 054). Deleting a
   whole folder still sends one message, not one per file.
3. **The Mac hears it.** The folder watcher (`scripts/mac/watch.mjs`) listens on that channel with
   the service key (`scripts/mac/link.mjs`) and starts the sync's tick at once. The tick does what
   the request asks, as before: trashes the file, downloads the upload, files the share.
4. **The phone sees it done.** The change comes back to the app over the app's own live updates.

The message carries only what kind of request it was and how many rows. The request itself stays
in the table, so a lost message loses nothing: the 3-minute check still finds it.

## Awake, syncing, asleep

On the same channel the Mac keeps a presence, "awake", or "syncing" while a tick runs. When the
Mac sleeps its connection drops, and its presence goes with it, so the phone reads that as asleep.
Study shows it beside the time of the last sync.

The app may watch that presence for my own PIN and nothing else on the channel (migration 055).
Only the service key, which lives on the Mac, may send or read requests there.

## When it isn't instant

- **The Mac is asleep.** Nothing can reach it; the request waits in its table, and the Mac acts
  at the first tick after waking.
- **The connection dropped.** supabase-js rejoins by itself, and the sync log says
  `link: back on mac:<pin>`. Until then, the 3-minute check carries on.
- **A tick is already running.** The request is taken straight after it.

## Why Broadcast

Live updates used to come from Postgres's change log (WAL), which Supabase polls whether or not
anything changed; that polling was the largest single load on my database. A Broadcast message is
sent only when something happens. [ADR 0004](adr/0004-broadcast-instead-of-wal-realtime.md) has
the reasoning and what it costs.
