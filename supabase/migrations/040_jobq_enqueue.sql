-- Reminders handed to jobq (github.com/Kunal-sora/jobq) instead of being
-- pushed from inside send-reminders.
--
-- jobq runs on this same database and creates its own schema and table
-- (jobq.jobs) with its own migrations. This file never creates or changes
-- them: it only adds the one way AcadKit puts work into that table, so
-- the shape of a job lives in one place. The body is plpgsql, which isn't
-- checked against the tables it names until it runs, so this applies
-- cleanly before jobq has ever started; calling it before then fails with
-- "relation jobq.jobs does not exist".
--
-- send-reminders calls it through supabase-js (rpc) with the service key.
-- jobq isn't exposed to the REST API, so the function runs as its owner
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

-- Server-side only. Supabase grants new functions in public to anon and
-- authenticated by default, so they're revoked by name as well as PUBLIC.
revoke execute on function public.jobq_enqueue(jsonb) from public, anon, authenticated;
grant execute on function public.jobq_enqueue(jsonb) to service_role;
