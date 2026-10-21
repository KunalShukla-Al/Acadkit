-- Live updates by Broadcast: a write to a table the app shows sends one
-- private message per PIN per statement on pin:<pin> ("change", with the
-- table and the operation), and the app refetches what changed
-- (src/hooks/useSync.ts). The tables leave the supabase_realtime
-- publication, so Realtime no longer polls the write-ahead log for every
-- change to every table, which was the database's biggest load.
--
-- Three of the tables the app listened to (portal_snapshots,
-- portal_snapshot_history, suggestions) were never published, so their
-- live updates never arrived; now they do.

create or replace function private.broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('table', tg_table_name, 'op', lower(tg_op)), 'change', 'pin:' || device_id, true)
  from (select distinct device_id from changed) d;
  return null;
end;
$$;

revoke all on function private.broadcast_change() from public;

-- One trigger per operation: a trigger with a transition table fires on one event.
do $$
declare
  t text;
  op text;
begin
  foreach t in array array[
    'settings', 'subjects', 'timetable_slots', 'attendance', 'marks', 'deadlines',
    'portal_snapshots', 'portal_snapshot_history', 'suggestions', 'plan_ticks'
  ] loop
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop trigger if exists %I on public.%I', t || '_broadcast_' || op, t);
      execute format(
        'create trigger %I after %s on public.%I referencing %s table as changed for each statement execute function private.broadcast_change()',
        t || '_broadcast_' || op, op, t, case op when 'delete' then 'old' else 'new' end
      );
    end loop;
  end loop;
end;
$$;

-- An owner may listen to their PIN's changes, and to nothing else on the topic.
drop policy if exists "pin_changes_owner_listens" on realtime.messages;
create policy "pin_changes_owner_listens" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) like 'pin:%'
    and (select private.owns_device(substr((select realtime.topic()), 5)))
  );

do $$
declare
  t text;
begin
  for t in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' loop
    execute format('alter publication supabase_realtime drop table public.%I', t);
  end loop;
end;
$$;
