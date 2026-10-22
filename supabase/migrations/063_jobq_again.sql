-- jobq (github.com/KunalShukla-Al/jobq) delivers reminders again, so the
-- two entry points 044 dropped come back as they were in 040 and 042.
--
-- jobq creates its own schema and table (jobq.jobs) with its own
-- migrations on its first run; this file never touches them. Both bodies
-- are plpgsql, which isn't checked against the tables it names until it
-- runs, so this applies cleanly before jobq has started again; calling
-- either before then fails with "relation jobq.jobs does not exist".
--
-- send-reminders calls them through supabase-js (rpc) with the service
-- key. jobq isn't exposed to the REST API, so each runs as its owner
-- (SECURITY DEFINER), with an empty search_path and every name qualified
-- so a caller can't point it at a table of their own.

/**
 * Enqueue jobs: a JSON array of {kind, payload, idempotency_key, run_at?}.
 * run_at defaults to now. A job whose idempotency_key is already queued
 * is skipped, so planning the same reminder twice queues it once.
 * Returns how many were new.
 */
create or replace function public.jobq_enqueue(jobs jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into jobq.jobs (kind, payload, idempotency_key, run_at)
  select
    j.job ->> 'kind',
    coalesce(j.job -> 'payload', '{}'::jsonb),
    j.job ->> 'idempotency_key',
    coalesce((j.job ->> 'run_at')::timestamptz, pg_catalog.now())
  from pg_catalog.jsonb_array_elements(jobs) as j(job)
  on conflict (idempotency_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

/**
 * Jobs a jobq run would pick up now: ready ones whose run_at has come,
 * and running ones whose lock has run out (their run died holding them).
 * send-reminders uses it to start jobq's Deliver even on a run that
 * queued nothing new, so a retry whose time has come isn't stranded.
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

-- Server-side only. Supabase grants new functions in public to anon and
-- authenticated by default, so they're revoked by name as well as PUBLIC.
revoke execute on function public.jobq_enqueue(jsonb) from public, anon, authenticated;
grant execute on function public.jobq_enqueue(jsonb) to service_role;
revoke execute on function public.jobq_due() from public, anon, authenticated;
grant execute on function public.jobq_due() to service_role;
