-- PersonaOS reads the Student Portal's attendance through my own logged-in Chrome tab on the Mac
-- (scripts/mac/portal-read.sh, scripts/lib/persona/portal.mjs), and its snapshots' history keeps
-- that source, beside the bookmarklet's, a pasted page's and a screenshot's.

alter table portal_snapshot_history drop constraint if exists portal_snapshot_history_source_check;
alter table portal_snapshot_history add constraint portal_snapshot_history_source_check
  check (source in ('bookmarklet', 'paste', 'restore', 'backfill', 'screenshot', 'mac'));
