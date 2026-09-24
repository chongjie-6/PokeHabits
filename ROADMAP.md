# OpenHabits — Roadmap

What is left, in the order it is worth doing. `DESIGN.md` holds the reasoning; this file holds the sequence.

- **Status:** phases 0–6 of §11 built and passing. Phase 7 (Field) is the only unfinished one, and it needs hardware.
- **Phases 1–3 of the previous edition of this file are done.** The test hole is filled apart from `lib/db.ts`, the shipping blockers are closed, and §13.8's actionable open questions are closed in the doc as well as the code.
- **Last updated:** 2026-09-05.

---

## 1. Where the tree actually stands

Verified 2026-09-08.

| Check                             | Result                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                        | **400 passed / 400**, 32 files, ~23s                                                                                     |
| `npm run lint`                    | clean                                                                                                                    |
| `npm run typecheck`               | clean                                                                                                                    |
| `npm run build`                   | clean, with no environment set; every route still static                                                                 |
| `npm run db:generate`             | no changes — the committed snapshot matches the schema                                                                   |
| `TODO` / `FIXME` / `HACK`         | 0                                                                                                                        |
| `@ts-ignore` / `@ts-expect-error` | 0                                                                                                                        |
| `eslint-disable`                  | 1, in `components/PaletteEditor.tsx` — a DOM read the exhaustive-deps rule cannot see through, argued at length in place |

CI (`.github/workflows/ci.yml`) runs the first four on every push and pull request. The build step is given no environment on purpose: every variable in `.env.example` is optional, so a build that needs one has broken that promise and CI is the thing that should say so.

---

## 2. What is left

### Blocked on hardware — §11 Phase 7

**The only unfinished phase, and the only item here that cannot be done at a desk.** §10 records why it matters: every Lighthouse run was against an _empty_ IndexedDB, because the CLI cannot seed one. The heatmap rendered zero cells and no habit was ever ticked, so **the two budgets that bear directly on G1 and G2 — INP on a tick, and the paint cost of ~371 SVG cells — are both unmeasured.**

§11 already prescribes the test: install to a home screen, add five habits, backfill a month, tick something, and watch. Decide §10's LCP question at the same time; the doc argues (a) _move the budget_ is probably right, and explicitly records (c) as rejected rather than available.

### Nobody watches the mail DLQ

New with §13.16, and the honest cost of moving the SMTP attempt out of the request. A send that fails after a successful hand-off is retried three times and then parked in QStash's dead letter queue, and **that account exists the whole time** — someone signed up, is waiting for a link, and nothing anywhere raises a hand. §13.10 had no such state.

This is the same shape as §8.5's Worker caveat and it is unresolved for the same reason: the fix is an alert, and there is nowhere in this app for an alert to go. `sendOnSignIn` means the person can rescue themselves by trying to sign in, which is the mitigation actually in place. **If somebody reports never receiving a link, read the DLQ first.** Wiring the QStash DLQ to something that mails whoever runs the deployment would close it properly, and needs a second mail path that does not depend on the one that just failed.

Two smaller things left open beside it: `/api/email` has no test, because everything in it is either a signature check or an SMTP call and the decidable parts were split into `email-queue.ts` where they are covered; and `x-forwarded-for` is read first-entry-only, which is correct behind Vercel because its proxy overwrites the header, and is the line to revisit behind a proxy that appends.

### `lib/share-card.ts` has no rendering test

The same shape of gap as `lib/db.ts` below, and a smaller one. `geometry()` is exported and covered, because an off-by-one there puts the last week over the edge of the image; the drawing needs a canvas, which means either jsdom (which does not implement one) or a real browser. **Look at a card on a phone during the §11 Phase 7 pass** — check it in both themes and against a custom palette, since the colours come from `getComputedStyle` at render time.

### `lib/db.ts` has no tests

The last file from the old phase 1 list. It is not an oversight and it is not free: testing IndexedDB means a fake, and the only practical fake is a dependency — in the one module that was hand-rolled specifically so the persistence layer would not have one (`lib/db.ts`'s own header says so).

Three things in it are worth covering and are not: `readSettings` (which is what stops a removed field riding a push), `applyMerge`'s request ordering (the purge must precede the puts), and `backfillSyncMetadata` (the v1→v2 upgrade, which runs exactly once per device and can never be re-run to fix). Decide the dependency question deliberately; `fake-indexeddb` is the candidate.

### Grow the quote corpus toward §12's ~400

At 168. Purely additive, and slow on purpose — §5.2's verification bar matters more than the number, and at this size the app's promise ("once per pass, no repeat within 21 days") is already true. `tests/quotes.test.ts` guards uniqueness, attribution, and the Durant/Aristotle misattribution.

**This is the one item that cannot be bulk-produced.** Every entry needs a traceable attribution, and the failure mode of the genre is exactly the confident-sounding quote that Einstein never said. Adding 230 unverified lines would break §5.2's bar and the corpus's whole claim to be worth reading.

### Pin the deployment specifics

- **The domain.** `SITE_URL` and `BETTER_AUTH_URL` both want it.
- **The region.** `vercel.json` pins functions to `iad1`, which is a _guess_ until the Neon database exists. Every sync is several round trips inside one advisory-locked transaction, so a mismatch is paid several times per request.
- **The database role.** `DATABASE_URL` must not name a superuser, or row-level security (§13.15) is bypassed silently. Neon's default role is fine; check the warning `npm run db:migrate` prints.

### More habit types

Genuinely new scope. Specify against §1's goals before building — G5 and the v1 non-goals rule out more than they look like they do.

The candidates, in the order they are worth doing: **a note per entry** (`Entry` already carries `updatedAt` and has no tombstone question to answer, so it merges like everything else); **pause/vacation**, which maps onto the `"rest"` level the heatmap already draws and would partly close §12 #5 and #7; **an `{ kind: "interval" }` cadence** anchored on `createdAt`. All three touch `lib/sync/validate.ts` and the habit form. Monthly cadence is the one to leave alone — it does not fit a seven-column grid.

**Richer stats is done** — §4.5, and listed under _Recently closed_.

---

## 3. Decisions, not work

§12 and §13.8 are a list of decisions. These are the ones whose right close is "leave it, and it is now said so in the doc":

§12 #2 (deck size — closes slowly by design), #3 (confetti), #5 (the forgiven final day), #7 (immediate archiving), #8 (Today → detail link), and §13.8 #2 (silent conflicts), #4 (the advisory lock), #6 (the five-minute poll).

Record the decision; do not reopen the reasoning.

**One genuinely narrow gap is noted rather than fixed** (§13.8 #8): a verification link opened on a _different_ device that already holds habits sets the signed-in hint through `useSessionSync`, without passing the consent step the sign-in form now imposes.

---

## 4. Housekeeping

- **Prettier, alone and on its own commit.** It would reformat the whole tree at once and bury the history of a codebase whose prose is load-bearing. Safe to do, because CI can prove it changed nothing.
- **Test-only exports:** `lib/dates.ts:weekdayIndex` is used by `tests/` and by no application code. (`deckFor` in `lib/quotes.ts` and `lib/facts.ts` was on this list until §5.4 gave it a caller.) `lib/store.ts:hydrate` is exported for the same reason and says so. Fine, but worth knowing before someone "cleans them up".
- **`@electric-sql/pglite`, `drizzle-orm` and `drizzle-kit` are all pre-1.0**, and all three carry either the schema or the suite that validates it. Only the lockfile pins them — `npm ci` is what makes CI honour it. `@upstash/redis` and `@upstash/qstash` are past 1.0 and `@upstash/ratelimit` past 2.0, but they are pinned the same way and by the same mechanism; nothing in the tree reads a version number.
- **Prettier is not a dependency and its defaults do not match this tree.** `npx prettier` reformats at 80 columns against a codebase written to ~100, so running it over an existing file produces a diff full of collateral. Format new files by hand.
- **`@types/nodemailer` stays at `^8` against nodemailer `^9`.** nodemailer 9 ships no `.d.ts` of its own and 8.0.1 _is_ the newest `@types/nodemailer`; the mismatch is DefinitelyTyped's numbering, not staleness.
- **`0006` is part-generated and part hand-written.** The `ENABLE`/`CREATE POLICY` half comes from `schema.ts`; the five `FORCE ROW LEVEL SECURITY` statements and the superuser warning do not, because drizzle-kit cannot express them — and without the `FORCE` half the policies never fire for the table owner, which is the role in `DATABASE_URL`. `tests/server/rls.test.ts` asserts `relforcerowsecurity` so a regeneration cannot quietly drop them.
- **The `drizzle/meta/` snapshot for `0005` was hand-edited**, because drizzle-kit cannot generate a schema move without an interactive answer and the answer it assumes is destructive. The check that it is right is `npm run db:generate` reporting no changes — run it after any schema edit, and treat output where you expected none as a real finding.
- **Leave `AGENTS.md` alone.** It is regenerated by `next dev`; removing it from a diff only re-creates the change.
- **Leave the four `hapi`-named storage keys alone** — `lib/db.ts:DB_NAME`, `lib/theme.ts:THEME_KEY`, `lib/session.ts:HINT_KEY`, and the `hapi_sync_seq` sequence. Each names data that already exists on a device or in Postgres. `lib/theme.ts:SKIN_KEY` and `PALETTE_KEY` share the prefix by choice rather than by history, which their headers explain.

---

## 5. Recently closed

Kept as a list because `DESIGN.md` records reversals rather than overwriting them, so the entries describing these as open are still there — with the closure appended beneath each.

| Was                                                                           | Now                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| No password reset (§13.8 #7, §13.10)                                          | §13.13 — one-hour single-use link, all sessions revoked, no account-enumeration oracle                                  |
| `theme` rode the synced settings blob (§13.8 #1)                              | Device-local, beside `skin` and `palette`; the validator accepts and drops the field an older device still sends        |
| Signing in silently merged a device into an account (#8)                      | A consent step in front of the first upload; both answers non-destructive                                               |
| Tombstones accumulated forever (#3)                                           | `TOMBSTONE_TTL_MS`, applied by client and server from one constant                                                      |
| `experimental.useOffline` unused (#5)                                         | Adopted — for honest connectivity detection, _not_ the free retry the entry predicted (§13.14)                          |
| `user` beside `users` (#9)                                                    | Better Auth's tables moved to a `pgSchema("auth")`, by hand-written `SET SCHEMA`                                        |
| Nothing pruned a dormant push subscription (§8.5)                             | `SUBSCRIPTION_TTL_MS`, against a `last_seen_at` the client refreshes on app start                                       |
| No `metadataBase`, no OG image, no favicon (§8.6)                             | All three; the build stays warning-free with no environment set                                                         |
| No CSP on app routes                                                          | §8.7 — and explicit about the `'unsafe-inline'` that static prerendering plus a caching service worker make unavoidable |
| Verification email was light-only (§13.9)                                     | Dark variant, and a shell shared with the reset mail                                                                    |
| `importBundle`'s `"replace"` mode was unreachable                             | An import-mode picker, with the destructive branch behind a second confirmation                                         |
| Two sections numbered §13.11                                                  | The origin section is §13.12; every citation moved with it                                                              |
| `deleteEntriesFor`, `quoteById` unreferenced                                  | Deleted                                                                                                                 |
| Isolation rested on the `where user_id` clauses alone                         | §13.15 — row-level security on all five tables, `FORCE`d, opened per transaction by `lib/server/scope.ts`               |
| "Richer stats" was unspecified scope                                          | §4.5 — weekday and monthly rollups and per-habit streaks, in `lib/insights.ts`; all derived, nothing stored             |
| Deleting a habit said it "cannot be undone", which the tombstone contradicted | §7.4 — one undo slot with a TTL, restoring habit and entries under fresh stamps                                         |
| Tags filtered the collection view and nothing else                            | §5.4 — `Settings.dailyTags` narrows the deck the daily card draws from                                                  |
| The grid could only be looked at                                              | §4.6 — `lib/share-card.ts` draws it to a PNG for the share sheet, or a download                                         |
