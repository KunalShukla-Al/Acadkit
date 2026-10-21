# Contributing to AcadKit

Thanks for helping. Bug reports, ideas and pull requests are all welcome. Start with an
[issue](https://github.com/KunalShukla-Al/Acadkit/issues/new/choose) for anything bigger than
a small fix, so we can agree on the approach first.

## Running it

```bash
npm install
npm run dev:mock    # the app on http://localhost:5173, with a seeded mock backend
```

Use Node 24, the version in `.nvmrc`: CI, Vercel and the Mac's sync all run it. `npm install`
also links the workspace package (`packages/core`) and turns on the pre-commit hook, which
lints the staged files and typechecks in a few seconds.

`dev:mock` needs no accounts or keys: any email and password signs in, to a semester of
fake data. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the pieces fit together.

## Where things are

The repo is one npm workspace with three parts that run in different places: the app, the
edge functions and the Mac. The rules they share live in `packages/core`.

| Folder | What's in it | Runs in |
| --- | --- | --- |
| `src/` | The app: `pages/` for screens, `components/`, `api/` for every read and write to Supabase, `lib/` for app logic, `design/` for the tokens | The browser |
| `packages/core/` | The rules: dates, the Day Order calendar, attendance, grades and CGPA, the marks plan, Siri's grammar and answers. Plain TypeScript, imported as `@acadkit/core/<module>` | The app, the edge functions and the Mac |
| `supabase/migrations/` | The database, one numbered file per change | Postgres |
| `supabase/functions/` | Edge functions: `feeds` (Shortcuts, Siri, the calendar), `send-reminders`, `study-search`, `portal-ingest` | Deno, on Supabase |
| `supabase/tests/` | pgTAP tests of row-level security | A local Supabase |
| `scripts/` | The Mac's side: the sync, Autopilot, the recorder, the night shift, the evals. Their shared parts are in `scripts/lib/`, the launch agents, menu bar and Quick Action in `scripts/mac/` | Node, on the Mac |
| `scripts/embedder/` | The Mac's copy of the search model. A package of its own (`npm ci --prefix scripts/embedder`), so CI and Vercel never install its 290 MB | Node, on the Mac |
| `scripts/dev-mock/` | The mock backend behind `dev:mock` and the e2e tests | Node |
| `e2e/` | Playwright specs, their fixtures, a small study folder (`study-fixture/`) and the screen pictures | A browser, against the mock |
| `docs/` | Setup for the Shortcuts, campus automations, Autopilot and the recorder, and the decision records in `docs/adr/` | |

## Where a change goes

- **A calculation** (a number the app shows, a date rule, how Siri reads a phrase) goes in
  `packages/core`, with its test beside it. Core can't use React, Supabase, the DOM or Node:
  Deno runs it as it is for the feeds function. Its modules import each other by relative path,
  with the `.ts` extension.
- **A read or write** goes in `src/api/`, in the file for its area. Pages and components never
  import the Supabase client; only the hooks for signing in and live updates do.
- **A Mac job** is a script in `scripts/` with its logic in `scripts/lib/`, where the tests
  are. It reports how it went through `scripts/lib/jobs.mjs`, so Study and the menu bar can say.
- **An edge function** that imports core deploys with `--use-api`, because core sits outside
  `supabase/`.

Each part has its own TypeScript project (`tsconfig.app.json`, `tsconfig.functions.json`,
`tsconfig.scripts.json`, `tsconfig.e2e.json`, `packages/core/tsconfig.json`), and
`npm run typecheck` checks them all.

## Checks

CI runs all of these on every pull request, and a PR merges only when they pass.

| Command                                | What it checks                                      |
| -------------------------------------- | --------------------------------------------------- |
| `npm run lint`                         | ESLint, with the React Compiler's rules as errors   |
| `npm run typecheck`                    | TypeScript, every project above                     |
| `npm test`                             | Unit tests (Vitest), beside the code in every part above |
| `npm run test:e2e`                     | The app in a browser against `dev:mock` (Playwright), as a phone |
| `npm run db:test`                      | Row-level security (pgTAP on a local Supabase; CI runs it when `supabase/` changes) |
| `npx vite build && npm run size`       | Bundle size against `bundle-budget.json`            |
| `npx vite build && npx @lhci/cli@0.15.1 autorun` | Lighthouse against `lighthouserc.json` |

These run on a Mac only, so CI skips them. Run them when a change touches what they cover.

| Command                  | What it checks                                                  |
| ------------------------ | --------------------------------------------------------------- |
| `npm run test:visual`    | Pictures of the design catalog, the tabs and the ball; `-- --update-snapshots` takes new ones |
| `npm run test:iphone`    | The e2e suite on WebKit as an iPhone                            |
| `npm run test:mac`       | The e2e suite on WebKit as a Mac                                |
| `npm run perf:screens`   | Lighthouse on the five tabs, signed in                          |
| `npm run shortcuts:check` | Every iPhone Shortcut built and signed through Apple's service |

The size and Lighthouse limits sit a little above today's numbers. If a change needs more,
raise the limit in the same PR and say why.

The first time you run the e2e tests, install the browsers with
`npx playwright install chromium webkit`.

`npm run db:test` needs Docker. On a Mac, `brew install colima docker` is enough: the script
starts Colima when it isn't running. `npm run db:start` and `npm run db:reset` give you the
same local database to try a migration on; `npm run db:stop` stops both.

## Database changes

- Add a new numbered file to `supabase/migrations/` (the next number after the last one).
  Never edit a migration that has already been applied.
- Every table holds a `device_id` and needs row-level security with a policy that checks
  `private.owns_device(device_id)`. The RLS tests fail if a table in `public` has RLS off.
- Add the new table to `supabase/tests/database/rls.test.sql`, so the tests prove one
  account can't read or change another's rows in it.
- Run `npm run db:types` after a schema change, so the typed client knows it.
- Don't run `supabase db push` yourself. After a merge to `main`, the Deploy workflow
  (`.github/workflows/deploy.yml`) lists the migrations and functions the merge brings, waits for
  approval in the `production` environment, then applies the migrations and deploys those
  functions. Its first run needs the project's history to match this folder, once:
  `scripts/repair-migration-history.sh`.

## Pull requests

- Keep each PR to one change, and explain in the description what it changes and why.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Never commit keys, `.env.local`, or anyone's personal data (PINs, register numbers,
  marks).

## Releases

Versions follow [Semantic Versioning](https://semver.org/). To release:

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new heading such as
   `## [1.1.0] - 2026-12-14`.
2. Set the same version in `package.json` with `npm version 1.1.0 --no-git-tag-version`.
3. Merge that to `main`, then tag it: `git tag v1.1.0 && git push origin v1.1.0`.

The Release workflow checks the tag matches `package.json`, then publishes a GitHub release
with that version's changelog section as its notes.

## Security

If you find a way to reach someone else's data, please don't open a public issue.
[Report it privately](https://github.com/KunalShukla-Al/Acadkit/security/advisories/new)
instead. [SECURITY.md](SECURITY.md) says what protects what.
