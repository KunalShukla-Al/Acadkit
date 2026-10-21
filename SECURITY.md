# Security

AcadKit holds one student's attendance, marks, timetable and study files: mine. This page says
what protects them, where the edges are, and how to tell me about a problem.

## Reporting a problem

Please don't open an issue for it. Use **Security → Report a vulnerability** on the repository,
which opens a private advisory only I can see (private vulnerability reporting has to be switched
on in the repository's settings for that button to show). Say what you found, how to reproduce
it, and what it lets someone do. I'll reply within a week, fix what's real on `main`, and say in
the advisory when it's fixed.

Only the latest release on `main` gets fixes.

## What protects what

| What | How |
| --- | --- |
| Signing in | Email and password through Supabase Auth. |
| Every row | Row-level security on every table, `to authenticated`, checking that the account owns the row's PIN (`private.owns_device`, migrations 015 and 049). The 4-digit PIN names the rows; it is not the lock. pgTAP tests (`supabase/tests`) check every table's policies, and run in CI. |
| Study files | A private bucket (`study-files`), readable only by the PIN's owner; the viewer reads through the client, and a download is a signed link that lasts an hour. |
| The Mac's access | The service-role key, in the repo's `.env.local` on the Mac and in the edge functions' secrets, never in the app. Anything prefixed `VITE_` is bundled into the app, so the service key never gets that prefix. |
| The iPhone's Shortcuts, Siri, the calendar | One revocable token per account, checked by the feeds function with a rate limit; see [ADR 0003](docs/adr/0003-tokens-for-what-reads-acadkit-without-signing-in.md) for what it can do. |
| The portal bookmarklet | Reads only the page it's run on and posts the numbers to `portal-ingest`. It holds no password or PIN. |
| Models | All local ([ADR 0002](docs/adr/0002-ai-stays-local.md)): no photo, note or recording goes to a model API, and nothing holds a key to one. |
| Deploys | Migrations and functions deploy from CI only after a required reviewer approves the run in the `production` environment. |

## Where the edges are

- **The feed token is a bearer secret in URLs.** Whoever has it can read my timetable,
  attendance and tests, put a file in Inbox and mark today's remaining classes absent, until I
  revoke it in Settings.
- **The edge functions read with the service role**, so for the feeds the function, not
  row-level security, is the boundary. Its handler has its own tests.
- **Leaked-password protection** (checking passwords against breach lists) needs a paid
  Supabase plan, so it's off.
- **The Mac holds the keys.** Anyone with my Mac's login has the service key and the study folder.
- **Dependencies** are pinned by `package-lock.json`, and Dependabot proposes updates, each one
  through the full CI before it can merge.
