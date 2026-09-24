# Deploying OpenHabits

Setting nothing is a supported configuration. This document is for the two
things that are not the default: turning on accounts and sync, and turning on
reminders. `.env.example` carries the full commentary on every variable.

---

## Configuration

`DATABASE_URL` is what turns accounts on, and in production it brings two
obligations with it: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, each fatal when
missing.

```bash
DATABASE_URL=postgres://…   # turns on sync and accounts; unset → 503, app unaffected
BETTER_AUTH_SECRET=         # signs session cookies; required in production
BETTER_AUTH_URL=            # the app's public origin; required in production
SMTP_USER=                  # a Gmail app password, not the account password
SMTP_PASSWORD=
MAIL_FROM=                  # From header; defaults to "OpenHabits <SMTP_USER>"
VAPID_PUBLIC_KEY=           # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=              # mailto: or https: contact; falls back to BETTER_AUTH_URL
CRON_SECRET=                # authenticates the hourly reminder sweep

UPSTASH_REDIS_REST_URL=     # turns on rate limiting; also the mail queue's envelope store
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=               # decouples outbound mail from the request; unset → sent inline
QSTASH_CURRENT_SIGNING_KEY= # what /api/email verifies deliveries with; unset → route refuses
QSTASH_NEXT_SIGNING_KEY=

npm run db:migrate
```

**Daily reminders are an hourly cron plus a per-device timezone.** "9am" is a
wall clock, so one daily invocation would only ever be nine o'clock in a single
timezone; the Cloudflare Worker in `workers/reminders.ts` calls `/api/cron/reminders` every
hour and the sweep asks each subscription whether it is that user's hour
_there_. Without the VAPID pair the Settings card says the deployment cannot
send rather than offering a switch, and without `CRON_SECRET` the cron route
refuses to run at all — it reads every account's habits, so unset means
disabled, not open.

**The app is told its own origin rather than working it out.** Inferring it
means reading the request's `Host` header, and that origin is what verification
links are built from — while `/api/auth/send-verification-email` takes any
address and no session. A forged `Host` would have this app mail a genuine link
into an attacker's server. Development still infers; production fails to start
accounts until `BETTER_AUTH_URL` is set.

**Email verification follows the mailer, not a flag.** With SMTP credentials
set, sign-up creates no session — the link in the mail does, an unverified
sign-in 403s and resends on the way out, and a failed send fails the sign-up so
the address isn't held hostage against a retry. With no credentials, requiring a
click that no mail can deliver would break sign-up entirely, so verification is
off.

**With a queue, what fails the sign-up is the hand-off** (DESIGN.md §13.16).
`QSTASH_TOKEN` moves the SMTP attempt out of the request: a failure to _enqueue_
still rolls the sign-up back and frees the address, but a failure to _send_ is
retried three times and then parked in QStash's dead letter queue — so an
account can exist while its verification mail is stuck there, and **nothing
alerts about it**. If somebody reports never receiving a link, the DLQ in the
QStash console is the first place to look. This is the same standing caveat as
the reminder Worker below: someone has to go and look, or wire an alert.

Both Upstash resources are created in the console (console.upstash.com) — a
Redis database in the region nearest `DATABASE_URL`, and a QStash instance. Set
`QSTASH_TOKEN` without the two signing keys and mail is enqueued and never
delivered: the worker refuses every request rather than trust an unsigned one,
because it mails a link to an address its own body names. The free tiers are
ample — one Redis command per request, one message per email.

`QSTASH_TOKEN` is ignored on localhost whatever it is set to, because QStash
delivers by making a request from its own network and cannot reach a laptop; a
development machine sends inline instead of filling the DLQ. Exercising the
queued path needs a public origin — a preview deployment, or a tunnel with
`SITE_URL` pointed at it.

**Rate limiting fails open** (§13.17). With Redis unset nothing is metered,
which is how this app ran before; with it set and unreachable, requests are
allowed rather than refused, because a store outage that 429s the site would be
a denial of service handed over for free. Refusals are visible only in the
Upstash dashboard, which analytics are enabled for.

---

## Vercel

Zero-config: it's a stock Next app and it builds with no environment set at all
— a first deploy works before the database exists, with sync and accounts
answering 503. Node comes from `engines` in `package.json` (Vercel doesn't read
`.nvmrc`; CI does).

Set these on the project, for Production **and** Preview:

```bash
DATABASE_URL=                # Neon's *pooled* connection string, ?sslmode=require
BETTER_AUTH_SECRET=          # a different value per environment
BETTER_AUTH_URL=https://openhabits.example   # per environment
SITE_URL=https://openhabits.example   # link previews only; Production, not Preview
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=OpenHabits <you@example.com>
VAPID_PUBLIC_KEY=            # omit the pair to ship with reminders switched off
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=                 # the scheduler sends this as the cron's Authorization header
```

**One cron job, hourly — from Cloudflare, not Vercel.** A single entry is
enough because the fan-out across timezones happens inside the sweep. What it
needs is a scheduler allowing a sub-daily interval, and Vercel Cron is capped at
daily below Pro. So `workers/reminders.ts` holds the schedule and calls the endpoint; see
[the section below](#cloudflare-the-reminder-schedule). The production
deployment has to be reachable without Vercel Authentication, which answers a
sweep with an SSO redirect rather than a 200.

**`BETTER_AUTH_URL` is one origin.** Every preview deployment answers on its
own `*.vercel.app` host, so a Preview value pointing at production mails a
preview's visitors a verification link into production. Give Preview its own
value, or leave accounts off there.

**`regions` in `vercel.json` must match the Neon region.** It's pinned to `iad1`
— every sync request is several round trips to Postgres inside one
advisory-locked transaction, so a function in Virginia talking to a database in
Frankfurt pays that latency several times over.

**`SITE_URL` is Production-only.** It decides what a link preview's image URL
says, and a preview deployment stamping its own `*.vercel.app` host into a card
that gets shared outlives the deployment it names.

**Pool through Neon's `-pooler` host.** `lib/server/db.ts` opens one connection
per instance with `prepare: false` precisely so a pooler can hand out a
different backend per checkout.

**Migrations do not run on deploy.** Run `npm run db:migrate` against the
production `DATABASE_URL` before promoting a build that needs it — the
alternative is a build step with authority over tables holding history that
exists nowhere else. Give previews their own Neon branch unless you want them
writing to real accounts.

**`DATABASE_URL` must not be a superuser.** Every table is under row-level
security, and a role with `BYPASSRLS` ignores the lot with no error to notice.
Neon's default role is fine; `postgres` on a local install is not. `db:migrate`
warns when the role applying it is a superuser.

**Production is deployed from CI, not from the Git integration.** `vercel.json`
sets `git.deploymentEnabled.main` to `false`, because Vercel and GitHub Actions
subscribe to the same push webhook independently — left on, Vercel ships a build
whose tests are still running, or have already failed. The `deploy` job in
`.github/workflows/ci.yml` runs `needs: verify` and does what the integration
did:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

It needs three repository secrets — `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`. Preview branches still deploy from Git, ungated.

**A copy made with the README's Deploy button inherits that switch.** The
button clones the repository into your account and deploys it with nothing set,
but your copy has no CI secrets, so nothing replaces the trigger `vercel.json`
turned off. If the first deployment does not start, or a later push to `main`
does not deploy, delete the `git` block from `vercel.json` in your copy — or add
the three secrets above and let CI deploy it.

---

## Docker

`docker-compose.yml` runs the app, a Postgres of its own and a one-shot
migration, with accounts and sync switched on. The only thing it insists on is
the session secret:

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" > .env
docker compose up -d          # http://localhost:3000
```

Every other variable from the [configuration](#configuration) above is passed
through from `.env` when set, and left off when not.

**The app connects as an ordinary role, not the image's superuser.** The
`postgres` image starts with a superuser, and a superuser bypasses row-level
security with no error to notice (§13.15). `docker/postgres-init.sh` creates an
`openhabits` role that owns the database, and both the migration and the app use
it. The script runs only on an empty volume: changing `OPENHABITS_DB_PASSWORD`
afterwards means an `ALTER ROLE` by hand.

**Migrations run on every `up`, and the app waits for them.** `migrate` is a
container that runs `npm run db:migrate` and exits; the app starts only if it
exits 0, so a failed migration leaves the site down rather than serving new code
against the old schema. Unlike Vercel above, nothing else shares this database
— there is no preview deployment for a migration to get ahead of.

**The public origin is baked in at build time.** Link-preview metadata is
prerendered (`lib/site-url.ts`), so after setting `BETTER_AUTH_URL` or `SITE_URL`
rebuild with `docker compose up -d --build`, not just a restart.

**Behind a domain, terminate TLS in front of it.** Set
`BETTER_AUTH_URL=https://habits.example` and point a reverse proxy at port 3000.
A secure context is not optional here: the service worker, install and push all
need one, and `localhost` counts while a LAN address like `http://192.168.1.20`
does not — so the app works there, but offline and install silently don't.

**Reminders are a profile.** With the VAPID pair and `CRON_SECRET` set,
`docker compose --profile reminders up -d` adds a container that calls the sweep
a minute past every hour — the same request the Cloudflare Worker below makes.

**Mail is sent inline.** The QStash queue delivers by calling the app from
QStash's network, so it is not wired into the compose file; set the SMTP
variables and a failed send fails the sign-up, as described above.

**Back up as the superuser.** `pg_dump` refuses to read a table whose policies
would filter it, and `FORCE ROW LEVEL SECURITY` applies them to the owning role:

```bash
docker compose exec db pg_dump -U postgres openhabits > openhabits.sql
```

---

## Cloudflare — the reminder schedule

The hourly sweep needs a scheduler that fires hourly and keeps firing. Vercel
Cron is capped at daily below Pro; GitHub Actions can do hourly but stops
scheduling after 60 days without a push, which is a clock that runs out exactly
when a feature is finished. A Cloudflare Worker cron trigger is free, hourly and
has no such condition.

`workers/reminders.ts` is the whole of it — thirty lines that hold no logic of their own,
plus `workers/wrangler.jsonc` holding the schedule. Set `SITE_URL` in that file
to the deployment's public origin, then, from the repository root:

```bash
npx wrangler@4 login
npx wrangler@4 secret put CRON_SECRET --config workers/wrangler.jsonc
npx wrangler@4 deploy --config workers/wrangler.jsonc
```

`CRON_SECRET` has to be the same value the Vercel project holds; the Worker
sends it as `Authorization: Bearer`, and the route answers 401 to anything else.
Wrangler is deliberately not a dependency of this project — it is a large
install carrying platform binaries, it would be pulled into every Vercel build
for a Worker that Vercel does not build, and this is deployed by hand about as
often as the schedule changes.

**Free-plan limits are not close.** Hourly is 24 invocations a day against
100,000; the Worker's own CPU time is a few milliseconds because waiting on the
sweep's response is wall clock, not CPU. The Worker has no `fetch` handler and
`workers_dev` is `false`, so the schedule is its only entry point.

To check it, run the sweep by hand — the same request the Worker makes:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://openhabits.example/api/cron/reminders
```

200 with counts is a sweep that ran, 200 with `skipped` a deployment with no
database or VAPID pair, 401 a mismatched secret, 503 an unset one.

**A failed run is quieter than the red CI run it replaces.** The Worker throws
on any status but 200, because a throw is what marks a cron invocation failed;
it shows up under the Worker's **Cron Events** and in its logs, which
`observability` in `wrangler.jsonc` keeps. Nothing emails you about it. Per
DESIGN.md §8.5 a reminder that silently doesn't fire is the worst outcome this
feature has, and the scheduler is one of the ways it can — so if you want to
know, add a Cloudflare notification on Worker errors, or watch
`npx wrangler@4 tail openhabits-reminders` after a change.
