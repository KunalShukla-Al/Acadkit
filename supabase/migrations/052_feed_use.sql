-- One call per feed request, made by the feeds function with the service
-- role: the token is looked up, refused if its account no longer owns the
-- PIN (deleted, or claimed again), stamped with when it was used, and
-- counted against a limit per minute. One UPDATE does all of it, so two
-- requests at once can't both slip under the limit.

alter table feed_tokens add column if not exists window_start timestamptz;
alter table feed_tokens add column if not exists hits int not null default 0;

create or replace function feed_use(p_token text, p_limit int default 30)
returns table (device_id text, allowed boolean)
language sql
volatile
security invoker
set search_path = public
as $$
  update feed_tokens t
     set last_used_at = now(),
         window_start = case when t.window_start is null or now() - t.window_start >= interval '1 minute' then now() else t.window_start end,
         hits = case when t.window_start is null or now() - t.window_start >= interval '1 minute' then 1 else t.hits + 1 end
   where t.token = p_token
     and exists (select 1 from device_owners o where o.device_id = t.device_id)
  returning t.device_id, t.hits <= p_limit;
$$;

-- The feeds call it as the service role; nobody else needs it, and PostgREST
-- serves it to no one else.
revoke all on function feed_use(text, int) from public, anon, authenticated;
grant execute on function feed_use(text, int) to service_role;
