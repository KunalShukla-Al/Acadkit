-- Which VAPID key each push subscription was made with.
--
-- A browser's subscription is bound to the public key it was made with,
-- and the push service refuses a push signed with any other. The original
-- pair's private half exists only as the send-reminders secret
-- VAPID_PRIVATE, so the app moves every browser onto a new key
-- (src/lib/push.ts) and records the key here. send-reminders signs a row
-- with VAPID_PUBLIC_V2 / VAPID_PRIVATE_V2 when this is that key, else with
-- the original pair; jobq only holds the new pair and skips the rest.
--
-- null = the original key: every row from before this migration, and a
-- browser that couldn't be moved and went back on it.
--
-- The policy from 015 (owner_all_push_subscriptions) is unchanged: it
-- covers every column. Run in the SQL editor (not `supabase db push`);
-- safe to run twice.

alter table public.push_subscriptions add column if not exists vapid_public text;

comment on column public.push_subscriptions.vapid_public is
  'VAPID public key (base64url) the subscription was made with; null = the original key.';
