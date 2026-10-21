-- feed_use (migration 052): the feeds' one call per request. As the
-- service role, as the feeds call it.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@feed.test');
insert into device_owners (device_id, user_id) values ('1111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into feed_tokens (device_id, token) values ('1111', 'tok-a'), ('9999', 'tok-orphan');

set local role service_role;

select results_eq($$select device_id, allowed from feed_use('tok-a', 2)$$, $$values ('1111'::text, true)$$, 'a known token answers with its PIN');
select results_eq($$select allowed from feed_use('tok-a', 2)$$, $$values (true)$$, 'the second call in the minute is allowed');
select results_eq($$select allowed from feed_use('tok-a', 2)$$, $$values (false)$$, 'the third goes over a limit of two');
select is_empty($$select * from feed_use('nope', 2)$$, 'an unknown token gets nothing');
select is_empty($$select * from feed_use('tok-orphan', 2)$$, 'a token whose PIN nobody owns gets nothing');
select isnt((select last_used_at from feed_tokens where token = 'tok-a'), null, 'a call stamps when the token was used');

select * from finish();
rollback;
