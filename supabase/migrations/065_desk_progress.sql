-- The Desk's progress (docs/desk.md), one row per item.
--
-- The Desk's questions, topics and videos come from <pin>/desk.json and its
-- course parts, which the sync writes from the study folders. A row here
-- names an item by the key that file gives it ("PS/ps-ct-1/A1", or
-- "topic:PS:1.2", "video:<id>"), so a pick, a flag or a topic's status made
-- on the phone shows on the Mac, and the Mac's desk writes the same rows
-- (scripts/desk-bridge.mjs). The later write of an item wins, by updated_at.

create table if not exists desk_progress (
  device_id text not null,
  item_key text not null check (length(item_key) between 1 and 160),
  status text check (status in ('new', 'learning', 'done', 'revise')),
  flag boolean not null default false,
  pick text check (pick ~ '^[A-F]$'),
  attempted_at timestamptz,
  result text check (result in ('correct', 'wrong', 'unreviewed')),
  note text check (length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (device_id, item_key)
);

alter table desk_progress enable row level security;

drop policy if exists "desk_progress_owner" on desk_progress;
create policy "desk_progress_owner" on desk_progress
  for all to authenticated
  using (private.owns_device(device_id))
  with check (private.owns_device(device_id));

-- An older write never replaces a newer one: an offline phone's queued
-- change, or the Mac's, keeps the row only if it was made later.
create or replace function private.desk_progress_keep_newer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists desk_progress_keep_newer on public.desk_progress;
create trigger desk_progress_keep_newer before update on public.desk_progress
  for each row execute function private.desk_progress_keep_newer();

-- Live across devices: a write broadcasts on pin:<pin> (migration 056).
do $$
declare
  op text;
begin
  foreach op in array array['insert', 'update', 'delete'] loop
    execute format('drop trigger if exists %I on public.desk_progress', 'desk_progress_broadcast_' || op);
    execute format(
      'create trigger %I after %s on public.desk_progress referencing %s table as changed for each statement execute function private.broadcast_change()',
      'desk_progress_broadcast_' || op, op, case op when 'delete' then 'old' else 'new' end
    );
  end loop;
end;
$$;
