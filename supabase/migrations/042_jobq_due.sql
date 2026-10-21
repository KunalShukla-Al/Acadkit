-- How many jobq jobs are due right now, so send-reminders knows to start
-- jobq's Deliver workflow even on a run that queued nothing new: a push
-- that failed is retried later (jobq sets its run_at ahead), and nothing
-- else would start a run once that time comes. See dispatch.ts.
--
-- Like jobq_enqueue (migration 040), this reads jobq.jobs, which jobq
-- creates itself. The body is plpgsql, so this applies cleanly before
-- jobq's schema exists; calling it before then fails with
-- "relation jobq.jobs does not exist". SECURITY DEFINER with an empty
-- search_path, for the same reasons as 040.

/**
 * Jobs a jobq run would pick up now: ready ones whose run_at has come,
 * and running ones whose lock has run out (their run died holding them).
 */
create or replace function public.jobq_due()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
    select pg_catalog.count(*)::integer
    from jobq.jobs j
    where (j.status = 'ready' and j.run_at <= pg_catalog.now())
       or (j.status = 'running' and j.locked_until < pg_catalog.now())
  );
end;
$$;

-- Server-side only, as with jobq_enqueue.
revoke execute on function public.jobq_due() from public, anon, authenticated;
grant execute on function public.jobq_due() to service_role;
