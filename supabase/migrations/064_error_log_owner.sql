-- Crash reports go only under a PIN the writer owns.
--
-- 015 let any signed-in account insert any row, so one account could file
-- reports under another's PIN or fill the table. A report now carries the
-- writer's own PIN, or none when the crash came before a PIN was set
-- (src/lib/crashLog.ts sends null then). The length caps match what the
-- app already trims to, with room to spare; NOT VALID leaves old rows alone.

drop policy if exists "insert_own_error_log" on error_log;
create policy "insert_own_error_log" on error_log
  for insert to authenticated
  with check (device_id is null or private.owns_device(device_id));

alter table error_log drop constraint if exists error_log_sizes;
alter table error_log add constraint error_log_sizes check (
  length(coalesce(message, '')) <= 2000
  and length(coalesce(stack, '')) <= 8000
  and length(coalesce(component_stack, '')) <= 8000
  and length(coalesce(url, '')) <= 2000
  and length(coalesce(user_agent, '')) <= 1000
  and length(coalesce(release, '')) <= 100
) not valid;
