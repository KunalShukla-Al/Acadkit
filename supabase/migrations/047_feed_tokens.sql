-- Feeds: one private token per account, for what reads AcadKit without
-- signing in - the "today" endpoint the iPhone's Shortcuts call and the
-- webcal calendar (supabase/functions/feeds). The token is the whole
-- credential, so revoking is deleting the row, and a new one can be made
-- at once. The app shows it to its owner, to copy into a Shortcut.
--
-- The database makes the token: the app inserts its PIN alone, and may not
-- choose the value (column grant below). The feeds function looks tokens up
-- with the service role.

create table if not exists feed_tokens (
  device_id text primary key,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table feed_tokens enable row level security;

drop policy if exists "feed_tokens_owner_select" on feed_tokens;
create policy "feed_tokens_owner_select" on feed_tokens
  for select to authenticated using (owns_device(device_id));

drop policy if exists "feed_tokens_owner_insert" on feed_tokens;
create policy "feed_tokens_owner_insert" on feed_tokens
  for insert to authenticated with check (owns_device(device_id));

drop policy if exists "feed_tokens_owner_delete" on feed_tokens;
create policy "feed_tokens_owner_delete" on feed_tokens
  for delete to authenticated using (owns_device(device_id));

-- Insert names the PIN only; there is no update.
revoke insert, update on feed_tokens from authenticated;
grant insert (device_id) on feed_tokens to authenticated;
