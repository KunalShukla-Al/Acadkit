# 0004. Broadcast instead of WAL realtime

- Status: accepted with migration 056 (October 2026); written down 16 Nov 2026
- Covers: `supabase/migrations/056_broadcast_changes.sql`, `src/hooks/useSync.ts`

## The problem

A change made on one device has to show on the others: a class marked on the phone, a tick on the
run-up, a deadline Autopilot added from the Mac. AcadKit used Supabase Realtime's
Postgres Changes for this, which works by polling the database's write-ahead log for every change
to every published table and filtering it against each listener's row-level security.

On 18 Oct that polling was the largest part of the database's load: 1.36 million calls of the
log poll in the usage report, for one user. And three tables the app listened to
(`portal_snapshots`, `portal_snapshot_history`, `suggestions`) had never been added to the
publication, so their changes had silently never arrived.

## What I chose

Each write sends a small Broadcast message, and the app refetches what changed:

- A trigger on every table the app shows fires once per statement, with the rows it touched as a
  transition table, and sends one private `change` message per PIN on the topic `pin:<pin>`,
  saying only the table and the operation (migration 056).
- Only that PIN's owner may listen on its topic (a policy on `realtime.messages` using
  `private.owns_device`).
- The app maps the table to its queries and refetches them (`TABLE_TO_KEY` in `useSync`); tabs on
  one device tell each other through a BroadcastChannel.
- No table is in the `supabase_realtime` publication any more, so nothing polls the log.

## Why not the alternatives

- **Keep Postgres Changes, publish fewer tables**: the poll costs the same whatever is
  published, and each listener still costs a row-level security check per change.
- **Poll from the app**: a phone in a pocket would either drain its battery or miss changes for
  minutes.
- **Send the changed rows in the message**: rows can be large (a semester of attendance), and the
  app would have to merge them into its cache by hand; a refetch reuses the code that loaded them.

## What it costs

- **Every change means a refetch** of the table's queries, more reads than receiving the row.
  For one person's data it's small.
- **Every new table the app shows needs its triggers and a line in `TABLE_TO_KEY`**, or its
  changes don't arrive, the same silence as before, only now it's one place to look.
  `reading_now` (migration 062) added both.
- **Deploy order matters**: the app listens on Broadcast, so the migration must go out before or
  with the frontend, or live updates stop until it does.
