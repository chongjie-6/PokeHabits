# Security Policy

## Supported versions

OpenHabits ships from `main`. Fixes land there and go out with the next
deployment; there are no maintained release branches.

| Version       | Supported |
| ------------- | --------- |
| `main`        | ✅        |
| Anything else | ❌        |

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/chongjie-6/OpenHabits/security/advisories/new)
— _Security → Advisories → Report a vulnerability_. If that is unavailable to
you, email **chongjiechen@outlook.com** instead.

Please include:

- What the issue is, and what an attacker gets out of it
- Steps to reproduce, or a proof of concept
- The commit or deployment you found it on
- Whether any configuration is required (`DATABASE_URL` set, SMTP configured,
  VAPID keys present — see `.env.example`)

**What to expect:** an acknowledgement within 7 days, an assessment within 14,
and a fix on `main` before any public disclosure. You will be credited in the
advisory unless you would rather not be. This is an unfunded personal project —
there is no bug bounty.

Please give a reasonable window to fix before disclosing publicly, and don't run
tests against anyone else's deployment or data.

## Scope

The parts of this app worth looking at hardest:

- **`lib/server/scope.ts` and row-level security.** Every table is under RLS and
  `asUser` is the only way in. A query that reads rows outside its scope, or a
  path that reaches Postgres without a scope, is a real finding.
- **`lib/server/auth.ts:resolveUser`.** The identity seam. It fails closed:
  anything but a valid session is 401, and there is no bypass — a way around
  that is a finding.
- **`lib/server/base-url.ts`.** The auth origin is configured, never inferred,
  because `/api/auth/send-verification-email` accepts any address with no
  session. Anything that lets a request's `Host` header decide where a
  verification link points is a finding.
- **`public/sw.js`.** It must never cache `/api/`. A cached session response
  tells a signed-out browser it is signed in.
- **`POST /api/sync`.** The only endpoint that touches replicated data. Reading
  or writing another account's habits or entries is the worst case here.
- **`/api/cron/reminders`.** Fails closed with no `CRON_SECRET`, because it
  reads every account's habits.

## Not in scope

- The absence of a database. With `DATABASE_URL` unset, `/api/sync` and
  `/api/auth/*` answer 503 by design.
- Data stored unencrypted in the browser's IndexedDB. The app is local-first;
  anyone with your unlocked device has your habits, and that is the trade.
- A deployment misconfigured against the documentation — for example a
  `DATABASE_URL` pointed at a superuser role, which ignores row-level security
  silently. `npm run db:migrate` warns about that one.
- Missing rate limits on a self-hosted instance you control.
- Reports generated wholesale by a scanner with no demonstrated impact.
