-- A portal attendance screenshot sent from the iPhone (Back Tap) and read by
-- the Mac (scripts/lib/portal-shot.mjs) leaves its snapshots' history with
-- its own source, beside the bookmarklet's and a pasted page's.

alter table portal_snapshot_history drop constraint if exists portal_snapshot_history_source_check;
alter table portal_snapshot_history add constraint portal_snapshot_history_source_check
  check (source in ('bookmarklet', 'paste', 'restore', 'backfill', 'screenshot'));
