-- What Autopilot did: the Mac's model read a notice (scripts/lib/autopilot.mjs)
-- and added the tests and deadlines on it. Each time leaves a row here with
-- the deadlines it added, so the app can show the line "Autopilot added OS
-- FT-II from a notice" with Undo. Each deadline keeps its source too: the
-- file it was read from.
--
-- Only the Mac (service role) writes these. The app reads its own, and may
-- set undone_at and nothing else (column grant below).

alter table deadlines add column if not exists source text;

create table if not exists autopilot_actions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  -- The file it read, as "Inbox/IMG_2041.jpg" or "Downloads/notice.pdf".
  source text not null,
  -- One line: what it added.
  said text not null,
  -- How sure the model was of the dates, from 0 to 1.
  confidence real not null,
  deadline_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists idx_autopilot_actions_device on autopilot_actions(device_id, created_at desc);

alter table autopilot_actions enable row level security;

drop policy if exists "autopilot_actions_owner_read" on autopilot_actions;
create policy "autopilot_actions_owner_read" on autopilot_actions
  for select to authenticated using (private.owns_device(device_id));

drop policy if exists "autopilot_actions_owner_undo" on autopilot_actions;
create policy "autopilot_actions_owner_undo" on autopilot_actions
  for update to authenticated using (private.owns_device(device_id)) with check (private.owns_device(device_id));

revoke insert, update, delete on autopilot_actions from authenticated;
grant update (undone_at) on autopilot_actions to authenticated;
