-- Live updates by Broadcast (migration 056): a write sends one private
-- "change" on pin:<pin> per statement, and only that PIN's owner may
-- listen. Written as A, the way the app writes, through RLS.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- Without the Realtime service (CI leaves it out), nothing makes today's messages partition.
do $$
begin
  insert into realtime.messages (topic, extension, payload, event, private) values ('probe', 'broadcast', '{}', 'probe', true);
  delete from realtime.messages where topic = 'probe';
exception when others then
  execute format('create table realtime.messages_pgtap partition of realtime.messages for values from (%L) to (%L)', now() - interval '1 day', now() + interval '1 day');
end;
$$;

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@changes.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@changes.test');
insert into device_owners (device_id, user_id) values
  ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('2222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into subjects (id, device_id, code, name, credits, type) values
  ('00000000-0000-4000-8000-000000000001', '1111', '21CSC202J', 'Operating Systems', 4, 'theory');
delete from realtime.messages where topic like 'pin:%';

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
insert into marks (device_id, subject_id, label, component_type, marks_obtained, max_marks) values
  ('1111', '00000000-0000-4000-8000-000000000001', 'CT-1', 'CT', 12, 15),
  ('1111', '00000000-0000-4000-8000-000000000001', 'CT-2', 'CT', 13, 15);
update marks set marks_obtained = 14 where label = 'CT-2';
delete from marks where label = 'CT-1';
reset role;

select bag_eq(
  $$select payload->>'table' as tbl, payload->>'op' as op from realtime.messages where topic = 'pin:1111'$$,
  $$values ('marks', 'insert'), ('marks', 'update'), ('marks', 'delete')$$,
  'each write says the table and what happened, once per statement'
);
select ok((select bool_and(private and event = 'change' and extension = 'broadcast') from realtime.messages where topic = 'pin:1111'), 'as a private broadcast');
select is_empty($$select 1 from realtime.messages where topic = 'pin:2222'$$, 'B hears nothing of A''s writes');
select is_empty($$select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'$$, 'no table is left in the WAL publication');

-- Who may listen: Realtime checks the policy with realtime.topic() set to the channel.
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local realtime.topic to 'pin:1111';
select ok(exists(select 1 from realtime.messages where topic = 'pin:1111'), 'A may listen to their PIN''s changes');
set local realtime.topic to 'pin:2222';
select is_empty($$select 1 from realtime.messages$$, 'but not to B''s');
select throws_ok($$select private.broadcast_change()$$, '42501', null, 'and cannot call the trigger function');

select * from finish();
rollback;
