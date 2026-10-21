-- The instant link (migration 054): the phone's requests reach the Mac's
-- private channel, mac:<pin>, as one message per PIN per insert. Inserted
-- as A, the way the app does, through RLS.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@link.test');
insert into device_owners (device_id, user_id) values ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

insert into study_file_deletions (device_id, path, key) values
  ('1111', 'OS/a.pdf', '1111/blobs/a.pdf'),
  ('1111', 'OS/b.pdf', '1111/blobs/b.pdf'),
  ('1111', 'OS/c.pdf', '1111/blobs/c.pdf');
insert into study_uploads (device_id, path, key) values ('1111', 'Inbox/IMG_1.jpg', '1111/inbox/x/IMG_1.jpg');

reset role;

select is((select count(*) from realtime.messages where topic = 'mac:1111'), 2::bigint, 'two inserts, two messages: a delete of three files wakes the Mac once');
select results_eq(
  $$select payload->>'kind', (payload->>'count')::int from realtime.messages where topic = 'mac:1111' order by inserted_at, payload->>'kind'$$,
  $$values ('delete', 3), ('upload', 1)$$,
  'each says what was asked, and how many'
);
select ok((select bool_and(private) from realtime.messages where topic = 'mac:1111'), 'only the private channel carries them');
select ok((select bool_and(event = 'request' and extension = 'broadcast') from realtime.messages where topic = 'mac:1111'), 'as a broadcast request');
select is_empty($$select 1 from realtime.messages where topic like 'mac:%' and topic <> 'mac:1111'$$, 'no other PIN hears them');

-- The Mac's presence (migration 055). Realtime lets a client onto a channel when the policy
-- passes with realtime.topic() set to it; its owner may listen to presence, and to nothing else.
insert into realtime.messages (topic, extension, payload, event, private) values
  ('mac:1111', 'presence', '{"state": "awake"}', 'presence', true),
  ('mac:2222', 'presence', '{"state": "awake"}', 'presence', true);

-- The app cannot send on the channel itself: only the trigger does.
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
select throws_ok($$select private.tell_mac()$$, '42501', null, 'the app cannot call the trigger function');

set local realtime.topic to 'mac:1111';
select ok(exists(select 1 from realtime.messages where topic = 'mac:1111' and extension = 'presence'), 'A may listen to their Mac''s presence');
select is_empty($$select 1 from realtime.messages where extension = 'broadcast'$$, 'but not to the requests sent to it');
set local realtime.topic to 'mac:2222';
select is_empty($$select 1 from realtime.messages$$, 'A hears nothing of B''s Mac');
set local realtime.topic to 'acadkit-1111';
select is_empty($$select 1 from realtime.messages$$, 'nor anything on another topic');

select * from finish();
rollback;
