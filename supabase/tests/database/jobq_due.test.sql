-- jobq_due (migration 042): how send-reminders knows jobq has work due
-- even on a run that queued nothing new.
--
-- jobq creates jobq.jobs itself, so the local stack built from
-- supabase/migrations doesn't have it. The table is created here from
-- jobq's own migration (internal/migrate/migrations/001_jobs.sql), inside
-- the same transaction, and is gone again after the rollback.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

-- ---------------------------------------------------------------------------
-- jobq's table, copied from jobq (keep in step with 001_jobs.sql)
-- ---------------------------------------------------------------------------

create schema if not exists jobq;

create table if not exists jobq.jobs (
  id              bigint generated always as identity primary key,
  kind            text        not null check (kind <> ''),
  payload         jsonb       not null default '{}',
  idempotency_key text        not null unique check (idempotency_key <> ''),
  status          text        not null default 'ready'
                  check (status in ('ready', 'running', 'done', 'dead')),
  attempts        int         not null default 0,
  max_attempts    int         not null default 8 check (max_attempts > 0),
  run_at          timestamptz not null default now(),
  locked_until    timestamptz,
  lock_token      uuid,
  last_error      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_function('public', 'jobq_due', array[]::text[], 'jobq_due() exists');
select function_returns('public', 'jobq_due', array[]::text[], 'integer', 'it returns a count');
select is_definer('public', 'jobq_due', array[]::text[], 'it runs as its owner, so callers need no rights on jobq');
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.jobq_due()'::regprocedure),
  'its search_path is pinned empty'
);

-- ---------------------------------------------------------------------------
-- Counting
-- ---------------------------------------------------------------------------

select is(public.jobq_due(), 0, 'an empty queue: nothing due');

insert into jobq.jobs (kind, idempotency_key, status, run_at, locked_until, finished_at) values
  -- due
  ('webpush', 'due:ready-now',     'ready',   now(),                       null,                         null),
  ('webpush', 'due:ready-past',    'ready',   now() - interval '1 hour',   null,                         null),
  ('webpush', 'due:lease-expired', 'running', now() - interval '20 minutes', now() - interval '1 minute', null),
  -- not due
  ('webpush', 'not:retry-later',   'ready',   now() + interval '4 minutes', null,                        null),
  ('webpush', 'not:running',       'running', now() - interval '1 minute', now() + interval '4 minutes', null),
  ('webpush', 'not:done',          'done',    now() - interval '1 hour',   null,                         now()),
  ('webpush', 'not:dead',          'dead',    now() - interval '1 hour',   null,                         now());

select is(public.jobq_due(), 3, 'ready and due, plus running with an expired lease: 3');

update jobq.jobs set run_at = now() - interval '1 second' where idempotency_key = 'not:retry-later';
select is(public.jobq_due(), 4, 'a retry counts once its run_at has come');

update jobq.jobs set status = 'done', finished_at = now(), locked_until = null
where idempotency_key like 'due:%' or idempotency_key = 'not:retry-later';
select is(public.jobq_due(), 0, 'all delivered: nothing due');

-- ---------------------------------------------------------------------------
-- Who can call it
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.jobq_due()', 'execute'),
  'anon has no execute grant'
);

set local role anon;
select throws_ok($$select public.jobq_due()$$, '42501', null, 'signed out (anon) cannot call it');

reset role;
set local role authenticated;
select throws_ok($$select public.jobq_due()$$, '42501', null, 'a signed-in user (authenticated) cannot call it');

reset role;
set local role service_role;
select is(public.jobq_due(), 0, 'the service role (send-reminders) can call it');

reset role;
select ok(
  not has_function_privilege('public', 'public.jobq_due()', 'execute'),
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;
