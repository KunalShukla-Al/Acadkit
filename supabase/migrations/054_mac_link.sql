-- The instant link: a request the phone makes (a delete, or an upload,
-- which is also what a share is) is sent to the Mac on its private Realtime
-- Broadcast channel, mac:<pin> (scripts/mac/link.mjs), so it is acted on in
-- a second instead of at the next 3-minute tick.
--
-- One message per PIN per insert, however many rows it adds: deleting a
-- folder wakes the Mac once. realtime.send never fails the insert; at worst
-- the message is lost and the tick picks the request up.

create or replace function private.tell_mac() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', tg_argv[0], 'count', count(*)), 'request', 'mac:' || device_id, true)
  from added
  group by device_id;
  return null;
end;
$$;

revoke all on function private.tell_mac() from public;

drop trigger if exists study_file_deletions_tell_mac on public.study_file_deletions;
create trigger study_file_deletions_tell_mac
  after insert on public.study_file_deletions
  referencing new table as added
  for each statement execute function private.tell_mac('delete');

drop trigger if exists study_uploads_tell_mac on public.study_uploads;
create trigger study_uploads_tell_mac
  after insert on public.study_uploads
  referencing new table as added
  for each statement execute function private.tell_mac('upload');
