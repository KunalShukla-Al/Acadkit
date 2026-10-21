-- Row-level security: one account can never read or change another's data.
--
-- Two accounts, A (PIN 1111) and B (PIN 2222), each get a row in every
-- table. Then, signed in as A, every table is asked for B's rows, and
-- every kind of write is aimed at B's data. Run with `supabase test db`
-- against a local stack built from supabase/migrations; it never touches
-- the hosted project. Everything happens in one transaction that is
-- rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(108);

-- ---------------------------------------------------------------------------
-- Seed, as the table owner (RLS does not apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@rls.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@rls.test');

insert into device_owners (device_id, user_id) values
  ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('2222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into settings (device_id) select d from unnest(array['1111', '2222']) d;
-- Each PIN's subject has a known id, so a row planted under B below can name one.
insert into subjects (id, device_id, code, name, credits, type)
  select ('00000000-0000-4000-8000-00000000' || d)::uuid, d, '21CSC202J', 'Operating Systems ' || d, 4, 'theory'
  from unnest(array['1111', '2222']) d;
insert into timetable_slots (device_id, subject_id, day_order, start_time, end_time)
  select device_id, id, 1, '08:00', '08:50' from subjects;
insert into attendance (device_id, subject_id, date, start_time, end_time, status)
  select device_id, id, '2026-10-07', '08:00', '08:50', 'present' from subjects;
insert into marks (device_id, subject_id, component_type, label, marks_obtained, max_marks)
  select device_id, id, 'CT', 'CT-1 ' || device_id, 12, 15 from subjects;
insert into deadlines (device_id, title, type, due_date)
  select d, 'Lab record', 'lab', '2026-10-09' from unnest(array['1111', '2222']) d;
insert into semester_archives (device_id, label)
  select d, 'Semester 2' from unnest(array['1111', '2222']) d;
insert into portal_snapshots (device_id, subject_code, conducted, absent)
  select d, '21CSC202J', 40, 4 from unnest(array['1111', '2222']) d;
insert into portal_snapshot_history (device_id, subject_code, conducted, absent, as_of)
  select d, '21CSC202J', 40, 4, '2026-10-01' from unnest(array['1111', '2222']) d;
insert into push_subscriptions (device_id, endpoint, p256dh, auth)
  select d, 'https://push.test/' || d, 'key', 'secret' from unnest(array['1111', '2222']) d;
insert into error_log (device_id)
  select d from unnest(array['1111', '2222']) d;
insert into forecast_log (device_id, week_start, scope, model)
  select d, '2026-10-05', 'sgpa', 'v2' from unnest(array['1111', '2222']) d;
insert into sent_notifications (device_id, kind, ref)
  select d, 'quiz_due', '2026-10-07' from unnest(array['1111', '2222']) d;
insert into study_chunks (device_id, file_key, chunk_index, content, embedding)
  select d, d || '/blobs/1.pdf', 0, 'notes of ' || d, array_fill(0.1::real, array[384])::extensions.vector
  from unnest(array['1111', '2222']) d;
insert into study_file_deletions (device_id, path, key)
  select d, 'Operating_Systems/old.pdf', d || '/blobs/2.pdf' from unnest(array['1111', '2222']) d;
insert into study_uploads (device_id, path, key)
  select d, 'photo.jpg', d || '/inbox/photo.jpg' from unnest(array['1111', '2222']) d;
insert into suggestions (device_id, key, kind, payload)
  select d, 'deadline-1', 'deadline', '{}'::jsonb from unnest(array['1111', '2222']) d;
insert into syllabus_progress (device_id, course_code, unit, topic)
  select d, '21CSC202J', 1, 'Process states' from unnest(array['1111', '2222']) d;
insert into plan_ticks (device_id, task_id)
  select d, '2026-10-12#1' from unnest(array['1111', '2222']) d;
insert into card_reviews (device_id, card_id, box, due)
  select d, 'd3acc1c88e7408bd', 2, '2026-10-20' from unnest(array['1111', '2222']) d;
insert into feed_tokens (device_id)
  select d from unnest(array['1111', '2222']) d;
insert into siri_marks (device_id, said, rows)
  select d, 'I''m absent in OS', '[]'::jsonb from unnest(array['1111', '2222']) d;
insert into autopilot_actions (device_id, source, said, confidence)
  select d, 'Inbox/notice.jpg', 'Added OS FT-II', 0.9 from unnest(array['1111', '2222']) d;
insert into reading_now (device_id, path, page, kind)
  select d, 'Operating_Systems/notes.pdf', 3, 'phone' from unnest(array['1111', '2222']) d;
insert into lectures (id, device_id, memo, date, start_time, subject_code)
  select ('0000' || d || '-0000-4000-8000-000000000000')::uuid, d, '20261103 100500-A.m4a', '2026-11-03', '10:05', '21CSC202J'
  from unnest(array['1111', '2222']) d;
insert into lecture_moments (device_id, lecture_id, idx, start_s, end_s, content, page, embedding)
  select d, ('0000' || d || '-0000-4000-8000-000000000000')::uuid, 0, 0, 60, 'Round robin gives each process a time quantum', 24,
         array_fill(0.1::real, array[384])::extensions.vector
  from unnest(array['1111', '2222']) d;

insert into active_days (device_id, day)
  select d, '2026-10-07' from unnest(array['1111', '2222']) d;

insert into storage.buckets (id, name, public) values ('study-files', 'study-files', false)
  on conflict (id) do nothing;
insert into storage.objects (bucket_id, name)
  select 'study-files', d || '/manifest.json' from unnest(array['1111', '2222']) d;

-- ---------------------------------------------------------------------------
-- Structure: holds for tables added after these tests were written, too
-- ---------------------------------------------------------------------------

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'every table in public has row-level security switched on'
);

select is_empty(
  $$select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and roles && array['anon', 'public']::name[]$$,
  'no policy in public grants anything to signed-out (anon) or public'
);

-- ---------------------------------------------------------------------------
-- Signed in as A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
-- Older auth.uid() reads this one instead.
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- A can read their own rows. Without this, "B's rows are invisible" could
-- pass only because the seed or the policy hides everything.
select isnt_empty(
  format('select 1 from public.%I where device_id = %L', t, '1111'),
  format('A can read their own %s', t)
)
from unnest(array[
  'settings', 'subjects', 'timetable_slots', 'attendance', 'marks', 'deadlines',
  'semester_archives', 'portal_snapshots', 'portal_snapshot_history',
  'push_subscriptions', 'forecast_log', 'study_chunks', 'study_file_deletions',
  'study_uploads', 'suggestions', 'syllabus_progress', 'plan_ticks', 'card_reviews',
  'feed_tokens', 'siri_marks', 'autopilot_actions', 'device_owners', 'lectures', 'lecture_moments', 'reading_now'
]) t;

-- ...and none of B's, in any table.
select is_empty(
  format('select 1 from public.%I where device_id = %L', t, '2222'),
  format('A cannot read B''s %s', t)
)
from unnest(array[
  'settings', 'subjects', 'timetable_slots', 'attendance', 'marks', 'deadlines',
  'semester_archives', 'portal_snapshots', 'portal_snapshot_history',
  'push_subscriptions', 'error_log', 'forecast_log', 'sent_notifications',
  'study_chunks', 'study_file_deletions', 'study_uploads', 'suggestions',
  'syllabus_progress', 'plan_ticks', 'card_reviews', 'feed_tokens', 'siri_marks', 'autopilot_actions',
  'device_owners', 'active_days', 'lectures', 'lecture_moments', 'reading_now'
]) t;

-- Activity is write-only from the app: not even your own days come back.
select is_empty(
  $$select 1 from active_days where device_id = '1111'$$,
  'A cannot read even their own active days'
);
select lives_ok(
  $$insert into active_days (device_id, day) values ('1111', '2026-10-08')$$,
  'A can record their own active day'
);
select throws_ok(
  $$insert into active_days (device_id, day) values ('2222', '2026-10-08')$$,
  '42501', null, 'A cannot record a day under B''s PIN'
);
-- What src/lib/activity.ts relies on. A second launch the same day must
-- fail as a duplicate (23505), which the app treats as already recorded -
-- and an upsert can't be used instead: ON CONFLICT reads the existing row,
-- and with no read policy that is refused (42501). It was, for every user,
-- until the app switched to a plain insert.
select throws_ok(
  $$insert into active_days (device_id, day) values ('1111', '2026-10-08')$$,
  '23505', null, 'A second record of the same day is a duplicate, not a refusal'
);
select throws_ok(
  $$insert into active_days (device_id, day) values ('1111', '2026-10-09') on conflict (device_id, day) do nothing$$,
  '42501', null, 'An upsert is refused: ON CONFLICT needs a read policy active_days does not have'
);

-- Writing into B's PIN is refused outright.
select throws_ok(
  $$insert into marks (device_id, subject_id, component_type, label, marks_obtained, max_marks)
    values ('2222', '00000000-0000-4000-8000-000000002222', 'CT', 'planted', 15, 15)$$,
  '42501', null, 'A cannot add marks under B''s PIN'
);
select throws_ok(
  $$insert into attendance (device_id, subject_id, date, start_time, end_time, status)
    values ('2222', '00000000-0000-4000-8000-000000002222', '2026-10-08', '08:00', '08:50', 'absent')$$,
  '42501', null, 'A cannot mark attendance under B''s PIN'
);
select throws_ok(
  $$insert into subjects (device_id, code, name, credits, type)
    values ('2222', 'X', 'planted', 1, 'theory')$$,
  '42501', null, 'A cannot add a subject under B''s PIN'
);
select throws_ok(
  $$insert into study_uploads (device_id, path, key) values ('2222', 'x.jpg', '2222/inbox/x.jpg')$$,
  '42501', null, 'A cannot queue an upload into B''s folder'
);
select throws_ok(
  $$update marks set device_id = '2222' where device_id = '1111'$$,
  '42501', null, 'A cannot move their own marks into B''s PIN'
);

-- Updating or deleting B's rows matches nothing. The last section checks
-- they are all still there, unchanged.
update marks set marks_obtained = 0 where device_id = '2222';
update suggestions set status = 'dismissed' where device_id = '2222';
delete from attendance where device_id = '2222';
delete from device_owners where device_id = '2222';

-- Run-up ticks: A ticks their own, never B's.
select lives_ok(
  $$insert into plan_ticks (device_id, task_id) values ('1111', '2026-10-13#1')$$,
  'A can tick their own run-up task'
);
select throws_ok(
  $$insert into plan_ticks (device_id, task_id) values ('2222', '2026-10-13#1')$$,
  '42501', null, 'A cannot tick a task under B''s PIN'
);
delete from plan_ticks where device_id = '2222';

-- Feed tokens: the database makes them, and A can only make and revoke their own.
select throws_ok(
  $$insert into feed_tokens (device_id) values ('2222')$$,
  '42501', null, 'A cannot make a token under B''s PIN'
);
select throws_ok(
  $$insert into feed_tokens (device_id, token) values ('1111', 'chosen-by-the-client')$$,
  '42501', null, 'A cannot choose their own token''s value'
);
delete from feed_tokens where device_id = '2222';

select throws_ok(
  $$select * from feed_use((select token from feed_tokens where device_id = '1111'))$$,
  '42501', null, 'A cannot call feed_use: only the feeds, as the service role, can'
);

-- Siri's marks: written by the feeds alone; A can only undo their own.
select throws_ok(
  $$insert into siri_marks (device_id, said, rows) values ('1111', 'planted', '[]')$$,
  '42501', null, 'A cannot write a Siri mark, even their own'
);
select lives_ok(
  $$update siri_marks set undone_at = now() where device_id = '1111'$$,
  'A can undo their own Siri mark'
);
select throws_ok(
  $$update siri_marks set rows = '[{"x":1}]' where device_id = '1111'$$,
  '42501', null, 'A cannot rewrite what a Siri mark did'
);
update siri_marks set undone_at = now() where device_id = '2222';

-- What Autopilot added: written by the Mac alone; A can only undo their own.
select throws_ok(
  $$insert into autopilot_actions (device_id, source, said, confidence) values ('1111', 'planted', 'planted', 1)$$,
  '42501', null, 'A cannot write an Autopilot action, even their own'
);
select lives_ok(
  $$update autopilot_actions set undone_at = now() where device_id = '1111'$$,
  'A can undo their own Autopilot action'
);
select throws_ok(
  $$update autopilot_actions set deadline_ids = '{}' where device_id = '1111'$$,
  '42501', null, 'A cannot rewrite what Autopilot did'
);
update autopilot_actions set undone_at = now() where device_id = '2222';

-- A screenshot's history (migration 059): A takes back their own, and only a screenshot's.
reset role;
insert into portal_snapshot_history (device_id, subject_code, conducted, absent, as_of, source)
  select d, '21CSC202J', 48, 12, '2026-11-02', 'screenshot' from unnest(array['1111', '2222']) d;
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
delete from portal_snapshot_history where device_id = '1111' and source = 'screenshot';
select is_empty($$select 1 from portal_snapshot_history where device_id = '1111' and source = 'screenshot'$$, 'A can undo their own screenshot''s history');
delete from portal_snapshot_history where device_id = '1111';
select isnt_empty($$select 1 from portal_snapshot_history where device_id = '1111'$$, 'but no other history of theirs');
delete from portal_snapshot_history where device_id = '2222';

-- Flashcard reviews: A moves their own cards on, never B's.
select lives_ok(
  $$insert into card_reviews (device_id, card_id, box, due) values ('1111', 'e5b2c3cac92a2e23', 1, '2026-10-19')$$,
  'A can review their own card'
);
select throws_ok(
  $$insert into card_reviews (device_id, card_id, box, due) values ('2222', 'e5b2c3cac92a2e23', 1, '2026-10-19')$$,
  '42501', null, 'A cannot review a card under B''s PIN'
);

-- The PIN itself.
select throws_ok(
  $$insert into device_owners (device_id, user_id)
    values ('2222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '23505', null, 'A cannot claim B''s PIN'
);
select throws_ok(
  $$insert into device_owners (device_id, user_id)
    values ('3333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  '42501', null, 'A cannot claim a PIN in B''s name'
);

-- Functions.
select ok(private.owns_device('1111'), 'owns_device: A owns 1111');
select ok(not private.owns_device('2222'), 'owns_device: A does not own 2222');
select is_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'owns_device'$$,
  'owns_device is out of public, so PostgREST does not serve it'
);
select is_empty(
  $$select * from match_study_chunks('2222', array_fill(0.1::real, array[384])::extensions.vector, 5)$$,
  'searching B''s notes returns nothing'
);
select is_empty(
  $$select * from match_study_chunks_many('2222', jsonb_build_array(to_jsonb(array_fill(0.1::real, array[384]))), 5)$$,
  'a batch search of B''s notes returns nothing'
);
select is_empty(
  $$select * from match_lecture_moments('2222', array_fill(0.1::real, array[384])::extensions.vector, 5)$$,
  'searching B''s lectures returns nothing'
);

-- Continue (migration 062): A says where they're reading, and only for themselves.
select lives_ok(
  $$update reading_now set page = 9, kind = 'computer' where device_id = '1111'$$,
  'A can say where they are reading'
);
select throws_ok(
  $$insert into reading_now (device_id, path, kind) values ('2222', 'planted.pdf', 'phone') on conflict (device_id) do update set path = excluded.path$$,
  '42501', null, 'A cannot say where B is reading'
);

-- Lectures (migration 061): written by the Mac alone.
select throws_ok(
  $$insert into lectures (device_id, memo, date, start_time) values ('1111', 'planted.m4a', '2026-11-03', '10:00')$$,
  '42501', null, 'A cannot write a lecture, even their own'
);

-- Storage: the study-files bucket.
select results_eq(
  $$select name from storage.objects where bucket_id = 'study-files' order by name$$,
  $$values ('1111/manifest.json'::text)$$,
  'A sees only their own study files'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('study-files', '2222/inbox/x.jpg')$$,
  '42501', null, 'A cannot upload into B''s inbox'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('study-files', '1111/blobs/x.pdf')$$,
  '42501', null, 'A cannot write outside their own inbox'
);

-- ---------------------------------------------------------------------------
-- Signed out
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
set local request.jwt.claim.sub to '';

select is_empty(format('select 1 from public.%I', t), format('signed out, %s is empty', t))
from unnest(array['settings', 'marks', 'attendance', 'device_owners']) t;

select throws_ok(
  $$insert into marks (device_id, subject_id, component_type, label, marks_obtained, max_marks)
    values ('1111', '00000000-0000-4000-8000-000000001111', 'CT', 'planted', 15, 15)$$,
  '42501', null, 'signed out, nothing can be written'
);

-- ---------------------------------------------------------------------------
-- Back as the owner: B's data survived everything above
-- ---------------------------------------------------------------------------

reset role;

select is((select marks_obtained from marks where device_id = '2222'), 12::numeric, 'B''s marks are unchanged');
select is((select status from suggestions where device_id = '2222'), 'pending', 'B''s suggestion is unchanged');
select is((select count(*) from attendance where device_id = '2222'), 1::bigint, 'B''s attendance was not deleted');
select is((select count(*) from plan_ticks where device_id = '2222'), 1::bigint, 'B''s run-up ticks were not deleted');
select is((select count(*) from feed_tokens where device_id = '2222'), 1::bigint, 'B''s feed token was not revoked');
select is((select undone_at from siri_marks where device_id = '2222'), null, 'B''s Siri mark was not undone by A');
select is((select undone_at from autopilot_actions where device_id = '2222'), null, 'B''s Autopilot action was not undone by A');
select is((select count(*) from portal_snapshot_history where device_id = '2222' and source = 'screenshot'), 1::bigint, 'B''s screenshot history was not taken back by A');
select is(
  (select user_id from device_owners where device_id = '2222'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'B still owns 2222'
);

select * from finish();
rollback;
