-- push_subscriptions.vapid_public (migration 041): which VAPID key a
-- subscription was made with, so send-reminders signs it with the
-- matching pair.
--
-- The app saves it through the same owner-only policy as every other
-- column (015). Signed-out (anon) access is covered by rls.test.sql, which
-- asserts that no policy in public grants anon anything.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_column('public', 'push_subscriptions', 'vapid_public', 'push_subscriptions.vapid_public exists');
select col_type_is('public', 'push_subscriptions', 'vapid_public', 'text', 'it is text');
select col_is_null('public', 'push_subscriptions', 'vapid_public', 'it is nullable (null = the original key)');
select col_hasnt_default('public', 'push_subscriptions', 'vapid_public', 'it has no default');
select policies_are(
  'public', 'push_subscriptions', array['owner_all_push_subscriptions'],
  'the owner-only policy from 015 is still the only one'
);

-- ---------------------------------------------------------------------------
-- Seed, as the table owner (RLS does not apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@vapid.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@vapid.test');

insert into device_owners (device_id, user_id) values
  ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('2222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- A subscription saved before 041, the way the app wrote it then.
insert into push_subscriptions (device_id, endpoint, p256dh, auth)
  values ('1111', 'https://push.test/old', 'key', 'secret');

select is(
  (select vapid_public from push_subscriptions where endpoint = 'https://push.test/old'),
  null,
  'a row saved without it reads as null (the original key)'
);

-- ---------------------------------------------------------------------------
-- Signed in as A, the way the app saves a subscription
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
-- Older auth.uid() reads this one instead.
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select lives_ok(
  $$insert into push_subscriptions (device_id, endpoint, p256dh, auth, ua, vapid_public)
    values ('1111', 'https://push.test/new', 'key2', 'secret2', 'test', 'BNewKey')$$,
  'A can save a subscription with its key'
);
select is(
  (select vapid_public from push_subscriptions where endpoint = 'https://push.test/new'),
  'BNewKey',
  'and reads it back'
);

-- savePushSubscription is an upsert on endpoint.
select lives_ok(
  $$insert into push_subscriptions (device_id, endpoint, p256dh, auth, vapid_public)
    values ('1111', 'https://push.test/old', 'key3', 'secret3', 'BNewKey')
    on conflict (endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth, vapid_public = excluded.vapid_public$$,
  'A can upsert an existing row onto the new key'
);
select is(
  (select vapid_public from push_subscriptions where endpoint = 'https://push.test/old'),
  'BNewKey',
  'and the key is updated'
);

select throws_ok(
  $$insert into push_subscriptions (device_id, endpoint, p256dh, auth, vapid_public)
    values ('2222', 'https://push.test/b', 'key', 'secret', 'BNewKey')$$,
  '42501', null, 'A still cannot save a subscription on B''s account'
);

-- The move deletes the old endpoint's row.
delete from push_subscriptions where endpoint = 'https://push.test/old';
select is_empty(
  $$select 1 from push_subscriptions where endpoint = 'https://push.test/old'$$,
  'A can delete their own old row'
);

select * from finish();
rollback;
