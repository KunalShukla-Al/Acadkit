# Push notifications — deploy runbook

The app code (subscribe UI, service-worker push handler, subscription
storage) is already built and live. To start *sending* reminders, deploy
the Edge Function and schedule it. One-time setup, ~10 minutes.

## 0. Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in:
  `supabase login`
- Link the project: `supabase link --project-ref <PROJECT_REF>`
  (`<PROJECT_REF>` is the subdomain of your Supabase URL.)

## 1. Run the DB migration
In the Supabase SQL editor, run `supabase/migrations/011_push.sql`
(creates `push_subscriptions` + `sent_notifications`).

## 2. Set the function secrets
The VAPID **public** key is already embedded in the app
(`src/lib/push.ts`). Set the **private** key + the rest as secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC="<the public key from src/lib/push.ts>" \
  VAPID_PRIVATE="<the private key — kept out of git, see your notes>" \
  VAPID_SUBJECT="mailto:you@example.com" \
  CRON_SECRET="<any long random string you choose>"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 3. Deploy the function
```bash
supabase functions deploy send-reminders --no-verify-jwt
```
`--no-verify-jwt` is required because the scheduler calls it with a custom
header instead of a user JWT; the function checks `CRON_SECRET` itself.

## 4. Schedule it
Edit `cron.sql` — replace `<PROJECT_REF>` and `<CRON_SECRET>` with your
values — then run it in the SQL editor. It runs the function every 10 min.

Test immediately without waiting for cron:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders" \
  -H "x-cron-secret: <CRON_SECRET>"
# → {"candidates":N,"sent":M}
```

## 5. On each device
Open the **installed** PWA (iPhone: Share → Add to Home Screen first),
then **Settings → Reminders → Turn on reminders** and allow notifications.

## What gets sent (IST)
- **Class soon** — when a class on today's day order starts within 15 min.
- **Mark attendance** — 6 PM nudge if today's classes are still unmarked.
- **Deadline due** — 8 AM, for anything due within 24 h.
- **Low attendance** — 8 AM, any subject under 75%.

- **Skip verdict** — 8 AM, whether today's classes are safe to miss.

Dedupe is handled by `sent_notifications`, so the 10-min cadence won't spam.

The cron waits 20 s for a run (`timeout_milliseconds` in `cron.sql`; migration 048 added it to the
live job). Each run replies with how long it took (`ms`), which `net._http_response` keeps for six
hours, and logs it.

The calendar is no longer hand-copied into `index.ts`. It is imported from
`calendar.generated.ts`, which `scripts/gen-edge-calendar.mjs` writes from
`packages/core/src/semester.ts`. Each new semester: edit `semester.ts`, run

```bash
node scripts/gen-edge-calendar.mjs
supabase functions deploy send-reminders --no-verify-jwt
```

`scripts/gen-edge-calendar.test.ts` fails the build if the generated copy drifts.

## Delivering through jobq

[jobq](https://github.com/KunalShukla-Al/jobq) can deliver the pushes instead of this
function: send-reminders still decides what is due, and queues one job per reminder
in `jobq.jobs`, on this same database. jobq sends it, retries it if the push service
fails, and records it in `sent_notifications` once it's delivered. The switch is the
`REMINDERS_VIA_JOBQ` secret:

| Value | What the function does |
| --- | --- |
| `off` (default; also unset or anything else) | Pushes, exactly as before. |
| `shadow` | Pushes as before, and also queues a `noop` job per reminder (`shadow:<device>:<kind>:<ref>`). The response adds `enqueued` and `dispatched`. A failure to queue is logged and never stops a push. |
| `on` | Skips reminders already in `sent_notifications`, queues a `webpush` job (`webpush:<device>:<kind>:<ref>`) for the rest, and pushes nothing itself. The response adds `already_sent`, `enqueued` and `dispatched`. |

The job shapes are in `jobq.ts` and must match jobq's `webpush` handler. jobq holds
only the new VAPID pair (this function's `VAPID_PUBLIC_V2` / `VAPID_PRIVATE_V2`, set as
jobq's `VAPID_PUBLIC` / `VAPID_PRIVATE`) and the same `VAPID_SUBJECT`, and
`DATABASE_URL` pointing at this project's database. It skips subscriptions still on the
original key, so read [Moving to the new VAPID key](#moving-to-the-new-vapid-key) before
switching it on.

### Rollout

1. **Create jobq's schema.** Add jobq's repository secrets (its README lists them), then
   run its **Deliver** workflow once (Actions tab of the jobq repo). That run migrates the
   database and creates `jobq.jobs`. Without the database secret a run does nothing and
   still shows green, so check that the log ends with what's left in the queue.
2. **Add the enqueue function.** In the SQL editor, run
   `supabase/migrations/040_jobq_enqueue.sql` (not `supabase db push`). Then deploy this
   function; with the secret unset it behaves exactly as before:
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt
   ```
3. **Shadow.** `supabase secrets set REMINDERS_VIA_JOBQ=shadow`. Secrets reach the next
   run without a redeploy. The curl test above now answers
   `{"candidates":N,"sent":M,"enqueued":K,"mode":"shadow","dispatched":D}`; an
   `enqueue_error` there means the queue isn't reachable yet (step 1 or 2), and pushes
   still went out. `dispatched` is whether this run started jobq's Deliver workflow
   (see [Starting Deliver right away](#starting-deliver-right-away)).
4. **Compare, after a few days.** Every reminder the function recorded should have
   exactly one shadow job, and every shadow job a recorded reminder. Set `since` to at
   least an hour after you switched to shadow, and less than 7 days ago, and paste into
   the SQL editor. An hour, because a reminder sent just before the switch is planned
   again for up to an hour, so its shadow job lands in the window and its row doesn't,
   and the totals differ. 7 days, because jobq deletes done jobs a week after they
   finish (`JOBQ_KEEP_DONE`), and each deleted one would show up as "sent, no shadow job".
   ```sql
   -- Reminders and shadow jobs that don't pair up. No rows = they match.
   -- Each side is windowed; the other side is searched in full, so a
   -- reminder that straddles the window's edges isn't reported.
   with w as (
     select timestamptz '2026-10-06 00:00+05:30' as since,
            now() - interval '15 minutes' as until   -- skip a run still in flight
   ),
   shadow as (
     select substr(idempotency_key, length('shadow:') + 1) as key, created_at as at
     from jobq.jobs
     where kind = 'noop' and idempotency_key like 'shadow:%'
   ),
   sent as (
     select device_id || ':' || kind || ':' || ref as key, sent_at as at
     from public.sent_notifications
   )
   select 'sent, no shadow job' as mismatch, s.key, s.at
   from sent s, w
   where s.at between w.since and w.until
     and not exists (select 1 from shadow j where j.key = s.key)
   union all
   select 'shadow job, never sent', j.key, j.at
   from shadow j, w
   where j.at between w.since and w.until
     and not exists (select 1 from sent s where s.key = j.key)
   order by at;

   -- And the totals over the same window, which should be equal.
   select
     (select count(*) from jobq.jobs
      where kind = 'noop' and idempotency_key like 'shadow:%'
        and created_at between timestamptz '2026-10-06 00:00+05:30' and now() - interval '15 minutes') as shadow_jobs,
     (select count(*) from public.sent_notifications
      where sent_at between timestamptz '2026-10-06 00:00+05:30' and now() - interval '15 minutes') as sent;
   ```
5. **On.** `supabase secrets set REMINDERS_VIA_JOBQ=on`. Runs now answer
   `{"candidates":N,"sent":0,"already_sent":A,"enqueued":K,"mode":"on","dispatched":D}`,
   and pushes arrive from jobq. Set up [Starting Deliver right away](#starting-deliver-right-away)
   first: without it, jobq runs only on GitHub's 5-minute schedule, which starts late or
   not at all, so a class reminder can land after the class has begun, or never. Delivered jobs show up as
   `select status, count(*) from jobq.jobs where kind = 'webpush' group by status;`
   (`dead` ones carry the reason in `last_error`).
6. **Rollback** at any time: `supabase secrets set REMINDERS_VIA_JOBQ=off`. The function
   pushes again on its next run, and `sent_notifications` still holds everything jobq
   delivered, so none of it is sent twice. A `webpush` job still waiting in the queue at
   that moment can go out from both; to drop those first, run
   `update jobq.jobs set status = 'dead', last_error = 'rolled back', finished_at = now() where kind = 'webpush' and status = 'ready';`.

### Starting Deliver right away

GitHub's schedule for jobq's Deliver workflow can't be relied on: it starts runs late
when GitHub is busy, and the 5-minute one has never fired at all
(`gh run list -R KunalShukla-Al/jobq -w Deliver --event schedule` → "no runs found").
So this function starts Deliver itself, through GitHub's API (`workflow_dispatch`, the
same as the "Run workflow" button), on a run that:

- queued at least one new job (`shadow` or `on`), or
- queued nothing new, but jobq has jobs due (`on` only): a push jobq retries later, or a
  job whose run died. That count is `public.jobq_due()` (migration 042).

pg_cron already calls this function every 10 minutes, reliably, so reminders reach
jobq's runner within seconds of being queued, and a retry within 10 minutes of being
due. The schedule stays in `deliver.yml` as a backup, and jobq runs one drain at a time,
so an extra start only waits for the one before it.

With `REMINDERS_VIA_JOBQ` off nothing is started and the answer is exactly as before.
Without the token, nothing is started either: the log says so once per run, and
`dispatched` is `false`. A start that fails (GitHub down, the token expired) is logged
and reported as `dispatch_error` in the answer; it never changes what was sent or
queued, or the status of the answer. The token is never logged.

| Secret | Default | |
| --- | --- | --- |
| `GITHUB_DISPATCH_TOKEN` | unset (off) | A fine-grained token that can run Actions on jobq. |
| `GITHUB_DISPATCH_REPO` | `KunalShukla-Al/jobq` | Only for a fork. |
| `GITHUB_DISPATCH_WORKFLOW` | `deliver.yml` | Only if the workflow file is renamed. |

1. **Make the token** on GitHub: Settings → Developer settings → Personal access
   tokens → **Fine-grained tokens** → Generate new token.
   - Token name: `acadkit send-reminders → jobq Deliver`.
   - Resource owner: `KunalShukla-Al`.
   - Expiration: as long as GitHub allows (a year, or "No expiration" if offered). Put
     the renewal date in your calendar: once it expires, starts fail with
     `dispatch_error: "GitHub 401: Bad credentials"` and Deliver falls back to its
     schedule until you repeat steps 1–2.
   - Repository access: **Only select repositories** → `KunalShukla-Al/jobq`.
   - Permissions → Repository permissions → **Actions: Read and write**. Nothing else
     (Metadata: Read-only is added by GitHub on its own).
   - Generate, and copy it. GitHub shows it once.
2. **Set it as a secret**, pasted at a hidden prompt so it stays out of your shell
   history and off the screen:
   ```bash
   read -rs T   # paste the token, press Enter; nothing is shown
   supabase secrets set GITHUB_DISPATCH_TOKEN="$T" --project-ref shkfgxqvzixvbigesxlo
   unset T
   supabase secrets list --project-ref shkfgxqvzixvbigesxlo   # names and digests only
   ```
3. **Migration.** In the SQL editor, run `supabase/migrations/042_jobq_due.sql` (not
   `supabase db push`). It applies before jobq's schema exists; until then, calling it
   fails, which only shows as a `dispatch_error` with jobq `on`.
4. **Deploy this function:**
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt --use-api --project-ref shkfgxqvzixvbigesxlo
   ```
5. **Check it.** After the next run that queues something (or the curl test above, with
   `REMINDERS_VIA_JOBQ` at `shadow` or `on`), the answer has `"dispatched":true` and
   the run is on GitHub:
   ```bash
   gh run list -R KunalShukla-Al/jobq -w Deliver --event workflow_dispatch
   ```
   `"dispatched":false` with a `dispatch_error` says why: `GitHub 401` is a wrong or
   expired token, `GitHub 403` or `404` a token without Actions: Read and write on
   jobq, `GitHub 422` a workflow without `workflow_dispatch`. The function's logs
   (Dashboard → Edge Functions → send-reminders → Logs) show the same line. GitHub
   turns the whole workflow off after 60 days without activity in jobq; starts then
   fail too, until it's turned back on in jobq's Actions tab.

To stop it, `supabase secrets unset GITHUB_DISPATCH_TOKEN --project-ref shkfgxqvzixvbigesxlo`,
and revoke the token on GitHub.

## Moving to the new VAPID key

Every subscription is bound to the VAPID public key it was made with, and the push
service refuses a push signed with any other pair. The original pair's private half
exists only as this function's `VAPID_PRIVATE` secret, which can't be read back, so a
new pair was made (kept in `~/.config/acadkit/vapid.json`, never in git) and every
browser moves onto it:

- **The app** (`src/lib/push.ts`) subscribes with the new key, and saves which key a
  subscription was made with in `push_subscriptions.vapid_public` (migration 041; null
  = the original key). Each time it starts, a browser that has notifications allowed and
  a subscription on the original key unsubscribes it, subscribes again on the new key
  (no prompt: permission is already granted), saves the new row and deletes the old
  one. It doesn't start while the device is offline. If the new key can't be
  subscribed, it goes back on the original key and tries again on the next start; if
  neither key can be, the next start subscribes again; if the save fails, the next
  start saves it. One tab moves at a time. Browsers with reminders off, or
  notifications not allowed, are left alone.
- **This function** signs each push with the pair its row names (`vapid.ts`): rows
  whose `vapid_public` is `VAPID_PUBLIC_V2` with `VAPID_PRIVATE_V2`, everything else
  with `VAPID_PUBLIC` / `VAPID_PRIVATE`, as before. Without both V2 secrets it behaves
  exactly as before. A push that fails other than as gone (404/410) is now logged; a
  401/403 there with `new_key: true` means the V2 secrets are missing or wrong.
- **jobq** holds only the new pair, and delivers only to rows on its key. A device with
  nothing on the new key yet gets nothing from jobq (it isn't counted as sent or failed).

### Rollout

The order matters. A browser moves the moment it opens the new app, so this function
has to be able to sign for the new key before the app is out.

1. **Set the V2 secrets** from the key file, without printing the keys:
   ```bash
   VAPID_JSON="$HOME/.config/acadkit/vapid.json"
   supabase secrets set \
     VAPID_PUBLIC_V2="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["publicKey"])' "$VAPID_JSON")" \
     VAPID_PRIVATE_V2="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["privateKey"])' "$VAPID_JSON")" \
     --project-ref shkfgxqvzixvbigesxlo
   supabase secrets list --project-ref shkfgxqvzixvbigesxlo   # names and digests only
   ```
   `VAPID_PUBLIC_V2` must be the `VAPID_PUBLIC_KEY` in `src/lib/push.ts`. Leave
   `VAPID_PUBLIC` / `VAPID_PRIVATE` as they are: they still sign every subscription
   that hasn't moved.
2. **Migrations.** In the SQL editor, run `supabase/migrations/040_jobq_enqueue.sql` (if
   not already in) and `supabase/migrations/041_push_vapid_key.sql` (not
   `supabase db push`). 041 only adds a nullable column; the current app and function
   don't notice it.
3. **Deploy this function:**
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt --use-api --project-ref shkfgxqvzixvbigesxlo
   ```
   Every row is still on the original key, so nothing changes yet.
4. **Only then merge the app PR.** Vercel deploys `main` on its own. Merged any earlier,
   a browser that moves gets its reminders signed with the original pair and refused
   until step 3 is done, and before step 2 its new row can't be saved at all (no
   `vapid_public` column), so it gets nothing until 041 is in. The installed app keeps running its cached version until it
   picks up the update (the "new version" prompt), so browsers move over days, not at
   once; until then the old version keeps working on the original key.
5. **Shadow jobq**, if not already: `supabase secrets set REMINDERS_VIA_JOBQ=shadow
   --project-ref shkfgxqvzixvbigesxlo`. This function still delivers to both keys.
6. **Watch the move** in the SQL editor:
   ```sql
   -- Subscriptions and accounts on each key.
   select case
            when vapid_public is null then 'original'
            when vapid_public = 'BProUUQEOe5AskZg0hDybsBBEN0pDZYs0y0RE-RIio4mvgZjSmN-xUINLjErE6lfaJQ9IS5pXj8neUKomnSnvy4' then 'new'
            else 'other'
          end as vapid_key,
          count(*) as subscriptions,
          count(distinct device_id) as accounts
   from public.push_subscriptions
   group by 1
   order by 1;

   -- Accounts with no subscription on the new key: jobq would send them nothing.
   select device_id, count(*) as subscriptions, max(created_at) as newest
   from public.push_subscriptions
   group by device_id
   having count(*) filter (
     where vapid_public = 'BProUUQEOe5AskZg0hDybsBBEN0pDZYs0y0RE-RIio4mvgZjSmN-xUINLjErE6lfaJQ9IS5pXj8neUKomnSnvy4'
   ) = 0
   order by newest desc;
   ```
7. **Switch jobq on** (`REMINDERS_VIA_JOBQ=on`, step 5 of the jobq rollout above) only
   when all, or nearly all, active subscriptions are on the new key. Students who never
   open the app again stay on the original key and stop getting reminders from then on;
   they move as soon as they open it. Until then, `off` or `shadow` keeps this function
   delivering to everyone.

There is no moving back: a browser on the new key can't be signed for with the original
pair. Keep the V2 secrets set for as long as this function delivers anything; rolling
jobq back to `off` is still safe, since this function signs for both keys.
