-- jobq_enqueue (migration 040): what send-reminders relies on to hand
-- reminders to jobq.
--
-- jobq creates jobq.jobs itself, so the local stack built from
-- supabase/migrations doesn't have it. The table is created here from
-- jobq's own migration (internal/migrate/migrations/001_jobs.sql), inside
-- the same transaction, and is gone again after the rollback.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

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

select has_function('public', 'jobq_enqueue', array['jsonb'], 'jobq_enqueue(jsonb) exists');
select function_returns('public', 'jobq_enqueue', array['jsonb'], 'integer', 'it returns how many were new');
select is_definer('public', 'jobq_enqueue', array['jsonb'], 'it runs as its owner, so callers need no rights on jobq');
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.jobq_enqueue(jsonb)'::regprocedure),
  'its search_path is pinned empty'
);

-- ---------------------------------------------------------------------------
-- Enqueueing, as the owner
-- ---------------------------------------------------------------------------

select is(
  public.jobq_enqueue($$[
    {"kind": "webpush", "idempotency_key": "webpush:1111:class:slot-1|2026-10-07",
     "payload": {"device_id": "1111", "kind": "class", "ref": "slot-1|2026-10-07",
                 "title": "Operating Systems in 10 min", "body": "8:00 AM", "url": "/"}},
    {"kind": "noop", "idempotency_key": "shadow:1111:class:slot-1|2026-10-07", "payload": {},
     "run_at": "2026-10-07T08:00:00+05:30"}
  ]$$::jsonb),
  2,
  'two new jobs: returns 2'
);

select results_eq(
  $$select kind, payload, status, attempts, max_attempts from jobq.jobs order by idempotency_key$$,
  $$values
    ('noop'::text, '{}'::jsonb, 'ready'::text, 0, 8),
    ('webpush', '{"device_id": "1111", "kind": "class", "ref": "slot-1|2026-10-07",
                  "title": "Operating Systems in 10 min", "body": "8:00 AM", "url": "/"}'::jsonb,
     'ready', 0, 8)$$,
  'each job is stored as given, ready, with jobq''s defaults'
);

-- now() is the transaction's start time, here and inside the function.
select is(
  (select run_at from jobq.jobs where idempotency_key = 'webpush:1111:class:slot-1|2026-10-07'),
  now(),
  'run_at defaults to now'
);
select is(
  (select run_at from jobq.jobs where idempotency_key = 'shadow:1111:class:slot-1|2026-10-07'),
  '2026-10-07T08:00:00+05:30'::timestamptz,
  'a given run_at is kept'
);

-- The same reminder planned again on the next run.
select is(
  public.jobq_enqueue($$[
    {"kind": "webpush", "idempotency_key": "webpush:1111:class:slot-1|2026-10-07",
     "payload": {"device_id": "1111", "kind": "class", "ref": "slot-1|2026-10-07",
                 "title": "Operating Systems in 5 min", "body": "8:00 AM", "url": "/"}},
    {"kind": "noop", "idempotency_key": "shadow:1111:class:slot-1|2026-10-07", "payload": {}}
  ]$$::jsonb),
  0,
  'the same keys again: returns 0'
);
select is((select count(*) from jobq.jobs), 2::bigint, 'and adds nothing');
select is(
  (select payload ->> 'title' from jobq.jobs where idempotency_key = 'webpush:1111:class:slot-1|2026-10-07'),
  'Operating Systems in 10 min',
  'the first job is kept as it was'
);

select is(
  public.jobq_enqueue($$[
    {"kind": "noop", "idempotency_key": "shadow:1111:class:slot-1|2026-10-07", "payload": {}},
    {"kind": "noop", "idempotency_key": "shadow:1111:mark:mark|2026-10-07", "payload": {}}
  ]$$::jsonb),
  1,
  'one old key and one new: returns 1'
);
select is(public.jobq_enqueue('[]'::jsonb), 0, 'an empty list: returns 0');

-- ---------------------------------------------------------------------------
-- Who can call it
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$select public.jobq_enqueue('[{"kind": "noop", "idempotency_key": "shadow:anon", "payload": {}}]'::jsonb)$$,
  '42501', null, 'signed out (anon) cannot enqueue'
);

reset role;
set local role authenticated;
select throws_ok(
  $$select public.jobq_enqueue('[{"kind": "noop", "idempotency_key": "shadow:authenticated", "payload": {}}]'::jsonb)$$,
  '42501', null, 'a signed-in user (authenticated) cannot enqueue'
);

reset role;
set local role service_role;
select is(
  public.jobq_enqueue('[{"kind": "noop", "idempotency_key": "shadow:service_role", "payload": {}}]'::jsonb),
  1,
  'the service role (send-reminders) can enqueue'
);

reset role;
select is(
  (select count(*) from jobq.jobs where idempotency_key in ('shadow:anon', 'shadow:authenticated')),
  0::bigint,
  'nothing was queued by the refused calls'
);

select * from finish();
rollback;
