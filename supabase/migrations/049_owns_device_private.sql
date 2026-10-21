-- owns_device() is SECURITY DEFINER and backs every owner policy. In public,
-- PostgREST also served it to any signed-in user as /rest/v1/rpc/owns_device
-- (the advisor's "Signed-In Users Can Execute SECURITY DEFINER Function"). It
-- only ever answered for the caller, but nothing needs it over HTTP.
--
-- It moves to a schema PostgREST doesn't serve. The policies keep working:
-- they hold the function itself, not its name, and its own search_path
-- (public) still finds device_owners. A new policy names it
-- private.owns_device(device_id).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.owns_device(text) set schema private;
