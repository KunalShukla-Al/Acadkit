-- The Mac's state on the phone: the Mac tracks Realtime Presence on its
-- private channel, mac:<pin> ("awake", or "syncing" while a tick runs), and
-- drops out of it when it sleeps (scripts/mac/link.mjs). The app may listen
-- to that presence for a PIN it owns, and to nothing else on the channel:
-- the phone's requests (migration 054) stay the Mac's to hear.

drop policy if exists "mac_presence_owner_listens" on realtime.messages;
create policy "mac_presence_owner_listens" on realtime.messages
  for select to authenticated
  using (
    extension = 'presence'
    and (select realtime.topic()) like 'mac:%'
    and (select private.owns_device(substr((select realtime.topic()), 5)))
  );
