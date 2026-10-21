-- The send-reminders cron waits 20 s for the function, not pg_net's
-- default 5. Runs average 2 s but one with many pushes took 9, and pg_net
-- then logged "Timeout of 5000 ms reached" for a run that went on to
-- finish. The function now says how long it took (ms in its reply, which
-- net._http_response keeps, and in its log).
--
-- The job (send-reminders/cron.sql) is edited in place, so its secret never
-- appears here: only its call gains the timeout. A database without
-- pg_cron, like the local one the RLS tests build, is left alone.

do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  perform cron.alter_job(
    jobid,
    command := replace(command, 'body := ''{}''::jsonb', 'body := ''{}''::jsonb, timeout_milliseconds := 20000')
  )
  from cron.job
  where jobname = 'acadkit-send-reminders' and command not like '%timeout_milliseconds%';
end $$;
