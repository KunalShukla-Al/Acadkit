-- What Siri marked: "I'm absent in OS" writes attendance through the feeds
-- (supabase/functions/feeds), and each time leaves a row here with the
-- classes it marked and what each was marked before, so the app can show
-- the line "Siri marked you absent in OS" with Undo, and undo it exactly
-- (put back an auto-marked present, or remove a row that wasn't there).
--
-- Only the feeds (service role) write these. The app reads its own, and may
-- set undone_at and nothing else (column grant below).

create table if not exists siri_marks (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  -- What was said, as Siri heard it.
  said text not null,
  -- [{ subject_id, date, start_time, end_time, before: { status, auto_marked } | null }]
  rows jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists idx_siri_marks_device on siri_marks(device_id, created_at desc);

alter table siri_marks enable row level security;

drop policy if exists "siri_marks_owner_read" on siri_marks;
create policy "siri_marks_owner_read" on siri_marks
  for select to authenticated using (private.owns_device(device_id));

drop policy if exists "siri_marks_owner_undo" on siri_marks;
create policy "siri_marks_owner_undo" on siri_marks
  for update to authenticated using (private.owns_device(device_id)) with check (private.owns_device(device_id));

revoke insert, update, delete on siri_marks from authenticated;
grant update (undone_at) on siri_marks to authenticated;
