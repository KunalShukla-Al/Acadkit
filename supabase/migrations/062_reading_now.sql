-- Continue: where you're reading, so your other device can pick it up
-- (src/lib/reading.ts, scripts/mac/menubar.mjs). One row per PIN: the
-- study file and page the viewer last settled on, and the kind of device.
-- Sent live like the tables in 056.

create table if not exists reading_now (
  device_id text primary key,
  path text not null,
  page int,
  kind text not null check (kind in ('phone', 'computer')),
  updated_at timestamptz not null default now()
);

alter table reading_now enable row level security;

drop policy if exists "reading_now_owner_select" on reading_now;
create policy "reading_now_owner_select" on reading_now
  for select to authenticated using (private.owns_device(device_id));
drop policy if exists "reading_now_owner_insert" on reading_now;
create policy "reading_now_owner_insert" on reading_now
  for insert to authenticated with check (private.owns_device(device_id));
drop policy if exists "reading_now_owner_update" on reading_now;
create policy "reading_now_owner_update" on reading_now
  for update to authenticated using (private.owns_device(device_id)) with check (private.owns_device(device_id));

do $$
declare
  op text;
begin
  foreach op in array array['insert', 'update'] loop
    execute format('drop trigger if exists %I on public.reading_now', 'reading_now_broadcast_' || op);
    execute format(
      'create trigger %I after %s on public.reading_now referencing new table as changed for each statement execute function private.broadcast_change()',
      'reading_now_broadcast_' || op, op
    );
  end loop;
end;
$$;
