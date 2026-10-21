# 0003. Feeds, Siri and Shortcuts behind revocable tokens

- Status: accepted with the feeds (October 2026); written down 16 Nov 2026
- Covers: `supabase/functions/feeds`, migrations 047 (`feed_tokens`), 051 (`siri_marks`), 052 (`feed_use`)

## The problem

Some of AcadKit runs where the app can't sign in: the iPhone's Shortcuts (the morning alarm, Focus,
Leave, sharing a file), Siri, and the Calendar app's subscription. A Shortcut is a list of HTTP
requests with nothing to keep a session in, and the Calendar app fetches a URL on its own
schedule. Every row is guarded by row-level security on a signed-in account, so these need some
other credential.

## What I chose

One private token per account, made by the database, carried in the URL (or as a Bearer header),
and checked by one function:

- **The token** (migration 047) is 24 random bytes as hex. The app can ask for one but can't
  choose its value (a column grant), and only the account's owner can read it. Revoking deletes
  the row; turning the link on again makes a new one. The Mac rebuilds and re-signs the Shortcuts
  for the new token and takes them down for a revoked one.
- **The feeds function** (`supabase/functions/feeds`) is the only way in: `today`, the calendar,
  Siri's `ask`, `share` and `leave`. It reads with the service role, so nothing it serves passes
  through row-level security; instead it serves one account's own rows and nothing else.
- **Each request** goes through `feed_use` (migration 052), one UPDATE that finds the token's
  PIN, refuses it if the account no longer owns that PIN, stamps when it was used (Settings shows
  this), and counts it against 30 a minute. Two requests at once can't both slip under the limit.
- **Its writes are small and undoable**: `share` puts one file of up to 50 MB in Inbox; `leave`
  and Siri's "I'm absent in OS" mark classes absent and keep what they did (migration 051), so
  Today can undo it.

## Why not the alternatives

- **The account's session in the Shortcut**: a session needs refreshing, so the Shortcut would
  carry a refresh token, which is a full login that can't be revoked on its own.
- **The PIN**: four digits name the account's rows; they're not a secret and are easy to guess.
- **The service key**: it reads every account. It lives only on the Mac and in the functions.
- **A token per Shortcut or per scope**: more to revoke and rebuild, for one person's phone.

## What it costs

- **Whoever has the link can read my timetable, attendance and tests, put a file in my Inbox and
  mark today's remaining classes absent**, until I revoke it. Settings says so when it makes the
  link, and shows when it was last used.
- **The token sits in URLs**: in the Shortcuts, in the Calendar app's subscription, and in any
  log that records URLs. The Bearer header keeps it out of the URL where a client can send one.
- **A revoked or changed token breaks the Shortcuts** until they're installed again from
  Settings.
- **The function is the boundary**, not row-level security, so its handler is tested on its own
  (`handle.test.ts`) and through the mock in the e2e.
