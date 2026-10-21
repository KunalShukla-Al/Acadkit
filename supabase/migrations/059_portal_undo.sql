-- Undo for a portal screenshot's import (scripts/lib/portal-shot.mjs). The
-- action says what changed and keeps what each row was before, so the app
-- can put it all back (src/api/autopilot.ts).
--
-- changes, for kind 'portal':
--   { snapshots: [{ code, before }], history: [id], marks: [{ id, before }] }
-- where before is the row as it was, or null for one the import added.

alter table autopilot_actions add column if not exists kind text not null default 'notice';
alter table autopilot_actions drop constraint if exists autopilot_actions_kind_check;
alter table autopilot_actions add constraint autopilot_actions_kind_check check (kind in ('notice', 'portal'));
alter table autopilot_actions add column if not exists changes jsonb;

-- Undo takes back the history rows a screenshot added, and nothing else of the history.
drop policy if exists "snapshot_history_owner_undo" on portal_snapshot_history;
create policy "snapshot_history_owner_undo" on portal_snapshot_history
  for delete to authenticated using (private.owns_device(device_id) and source = 'screenshot');
