# OpenHabits — Design Document

A local-first PWA that pairs a **daily quote from someone worth quoting** with a **habit tracker** whose history renders as a GitHub-style contribution grid.

- **Status:** phases 0–6 built and passing; §11 has what remains. Sync (§13) runs: the auth seam is filled (§13.6) and an account is created from the Settings screen.
- **Stack:** Next.js 16.3.1 (App Router), React 19.2, Tailwind CSS v4, TypeScript 5, Vitest
- **Sync stack:** Postgres + Drizzle, Better Auth for identity, PGlite for tests (§13)
- **Last updated:** 2026-09-05

> Sections marked **Revised during build** record where implementation contradicted the plan. They are kept rather than overwritten — the reasoning that turned out to be wrong is usually the reasoning most worth having on the record.

---

## 1. Goals

| #   | Goal                                                            | Why it matters                                                                              |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| G1  | Ticking a habit takes **one tap, zero latency, zero network**   | The single most common action in the app. If it ever spins, the habit dies.                 |
| G2  | The history heatmap is the **emotional payoff**                 | People keep streaks because they can _see_ them. The grid is the product, not a stats page. |
| G3  | A quote every day that feels **chosen, not random**             | No repeats until the deck is exhausted; same quote on every device the user owns.           |
| G4  | Installs to the home screen and **works fully offline**         | It's a morning-routine app. It gets opened on a train, in a gym, on airplane mode.          |
| G5  | The user's data is **theirs** — exportable, no account required | Removes signup friction entirely and sidesteps a whole class of privacy work in v1.         |

### Non-goals (v1)

- Accounts, login, or cross-device sync (see §12 for the v2 path that the schema already accommodates) — **both halves have since been built: sync in §13, and the accounts it hangs off in §13.6. Still optional in the sense that matters: signed out, the app is exactly the app described here.**
- Social features — sharing, friends, leaderboards
- Quantified goals beyond a simple per-day count (no durations, no timers)
- Native app store distribution

---

## 2. Product shape

### 2.1 The core loop

```
  morning                     during the day                evening
  ┌──────────────┐            ┌──────────────┐             ┌──────────────┐
  │ open app     │            │ tap to tick  │             │ see the grid │
  │ read quote   │  ───────►  │ a habit done │  ─────────► │ gain a square│
  └──────────────┘            └──────────────┘             └──────────────┘
         ▲                                                        │
         └────────────────── streak pressure ─────────────────────┘
```

Everything else in the app is in service of that loop. A screen that doesn't feed it is a candidate for deletion.

### 2.2 Screens

| Route        | Name             | Purpose                                                                                                          | Built |
| ------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| `/`          | **Today**        | Quote card + a day's scheduled habits as tappable rows, swipeable between days (§6.8), with an edit mode (§6.10) | ✅    |
| `/week`      | **Week**         | 7-day × N-habit grid; backfill and correct past days                                                             | ✅    |
| `/stats`     | **Stats**        | The full contribution heatmap, streaks, completion rates                                                         | ✅    |
| `/settings`  | **Settings**     | Theme, week start, habits, export/import, danger zone                                                            | ✅    |
| `/habit?id=` | **Habit detail** | Single-habit heatmap, rename, cadence, archive, delete                                                           | ✅    |
| `/quotes`    | **Collection**   | Saved quotes or facts, searchable by author, source and tag                                                      | ✅    |

> **Added after the first release.** Stats grew two rollups under the grid (§4.5) and a share button beside its legend (§4.6); the habit detail screen has the same share button and no new route. Nothing was added to the tab bar — §2.1's rule still applies, and neither is a screen.

> **Revised during build.** Habit detail is `/habit?id=…`, not `/habit/[id]`. Habit ids are client-generated UUIDs the server has never heard of, so a dynamic segment could never be prerendered: every new habit would become a server round-trip, and opening one offline would fail until the service worker happened to have cached that exact URL. A search parameter keeps it a single static page, available offline the moment the shell is.

Navigation is a fixed bottom tab bar (**Today · Week · Stats · Settings**) with `padding-bottom: env(safe-area-inset-bottom)` so it clears the iOS home indicator in standalone mode. `/quotes` and `/habit?id=…` are pushed views reached from within a tab, not tabs themselves. `/reset-password` (§13.13) is a third, reached only from a link in an email.

### 2.3 Wireframes

**Today (mobile, 390px)**

```
┌─────────────────────────────────┐
│  Thursday, 14 August        ⚙︎  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ "It is not that we have   │  │  ← quote card
│  │  a short time to live,    │  │    serif, generous leading
│  │  but that we waste a lot  │  │    tap ♡ to save to collection
│  │  of it."                  │  │
│  │                           │  │
│  │  — SENECA          ♡  ⤴︎  │  │
│  └───────────────────────────┘  │
│                                 │
│  TO DO (2)        3 of 5 done   │
│  ┌───────────────────────────┐  │
│  │ 💧  Water × 8    ○ 5/8 +  │  │  ← counted habit: + increments,
│  │ ✍️  Journal        ○      │  │    to do until it reaches 8
│  └───────────────────────────┘  │
│  ▾ DONE (3)                     │  ← collapsible; a ticked row moves
│  ┌───────────────────────────┐  │    once ticking pauses (§6.9)
│  │ 🏃  Run            ● ✓    │  │  ← 56px row, whole row is the
│  │ 📖  Read 20 pages  ● ✓    │  │    tap target
│  │ 🧘  Meditate       ● ✓    │  │
│  └───────────────────────────┘  │
│                                 │
│  ▓▓▒▓▓░▓  7-day streak 🔥       │  ← mini strip, taps → /stats
│                                 │
│ ┌───┬───┬───┬───┐               │
│ │Tdy│Wk │Sts│Set│               │
│ └───┴───┴───┴───┘               │
└─────────────────────────────────┘
```

**Week**

```
        Mon Tue Wed Thu Fri Sat Sun
🏃 Run   ✓   ✓   ·   ✓   ·   ✓   ○     ← "·" = not scheduled (rest day)
📖 Read  ✓   ✓   ✓   ✓   ✓   ✓   ○     ← "○" = future, not yet actionable
🧘 Med   ✓   ✗   ✓   ✓   ○   ○   ○     ← "✗" = scheduled and missed
💧 Water 8   6   8   5   ○   ○   ○
        ───────────────────────────
        100% 75% 100% 88%
```

Any cell up to and including today is tappable to toggle. Future cells are inert and rendered at 40% opacity.

---

## 3. Data model

All dates are **local civil dates**, serialized `YYYY-MM-DD`. Never store UTC timestamps for day membership — a 23:00 tick in UTC+11 must land on the local day the user experienced, not the day before.

```ts
// lib/types.ts

/** 'YYYY-MM-DD' in the user's local timezone. */
type DayKey = string;

type Cadence =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] } // 0=Sun … 6=Sat
  | { kind: "weekly"; times: number }; // n times per week, any days

type Habit = {
  id: string; // crypto.randomUUID()
  name: string;
  emoji: string;
  color: HabitColor; // a palette key from §6.2, or a picked #rrggbb
  cadence: Cadence;
  target: number; // 1 for a simple tick; >1 for counted habits
  order: number; // manual sort position
  createdAt: DayKey;
  archivedAt: DayKey | null;
  updatedAt: number; // epoch ms — added by §13; LWW merge key
  deletedAt: number | null; // epoch ms — tombstone, see §13.4
};

type Entry = {
  habitId: string;
  date: DayKey;
  count: number; // 0 … target (or beyond; overachieving is allowed)
  updatedAt: number; // epoch ms — last-write-wins merge key for v2 sync
};

type Quote = {
  id: string; // stable slug, e.g. "seneca-short-time"
  text: string;
  author: string;
  source?: string; // "On the Shortness of Life", 49 AD
  tags: QuoteTag[]; // "discipline" | "resilience" | "craft" | …
};

type Settings = {
  theme: "system" | "light" | "dark";
  weekStartsOn: 0 | 1; // Sunday or Monday
  dayStartHour: number; // 0–6; 4 means "the day rolls over at 4am"
  reminderHour: number; // 0–23; when the daily reminder is due (§8.5)
  dailyMode: "quotes" | "facts"; // which corpus the daily card draws from (§5.3)
  favourites: string[]; // saved quote and fact ids
};
```

**Entry key is `${habitId}:${date}`** — a compound primary key. This makes "did I do X on day D" an O(1) point lookup and makes an idempotent toggle trivially safe to replay.

**Absence is meaningful.** No `Entry` row means "not logged", which is distinct from `count: 0` ("explicitly un-ticked"). Only the compound key exists.

> **Revised by §13.** "There are no tombstones" held only while the data lived on one device. Once it replicates, a missing row and a row the peer has not seen yet are the same observation, so `Habit` gained `deletedAt` and deleting writes a tombstone. Entries still have none, and for a reason worth reading: see §13.4.

### 3.1 Derived data (never stored)

| Value                     | Derivation                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- |
| `isScheduled(habit, day)` | Pure function of `cadence` + weekday + `createdAt`/`archivedAt` bounds        |
| `dayScore(day)`           | `completed / scheduled`, or `null` if nothing was scheduled                   |
| `level(day)`              | `dayScore` bucketed to 0–4 (§4.2)                                             |
| `currentStreak`           | Consecutive days back from today where `dayScore === 1`, skipping `null` days |
| `longestStreak`           | Same scan over the full history                                               |

Storing derived values is the main way this kind of app rots. A single `recomputeStats()` over ~5,000 entries runs in under 2ms, which is well inside a frame budget, so it is recomputed from scratch on every mutation and memoized on the store version counter.

---

## 4. The contribution heatmap

This is the signature component. It gets its own section because "GitHub squares" hides a half-dozen real decisions.

### 4.1 Geometry

**Desktop / ≥640px — classic horizontal.** Columns are weeks, rows are weekdays.

```
       Sep   Oct   Nov   Dec   Jan   Feb   Mar
 Mon   ░▓▒░░ ▓▓░▒▓ ░░▓▓▒ ▒▓░░▓ ▓▒░▓░ ░▓▓▒░ ▓░▒▓
       ░░▓▒▓ ░▒▓▓░ ▓▒░░▓ ░▓▓▒░ ▒░▓░▓ ▓▓░▒▒ ░▓▓░
 Wed   ▓▒░░▓ ▓░▒░▓ ░▓▒▓░ ▓░░▓▒ ░▓▒▓▓ ░▒▓░▓ ▒░▓▓
       ▒▓▓░░ ░▓▓▒░ ▓░▓▒▓ ▒▓░▒░ ▓░░▓▒ ▓░▒▓░ ▓▒░░
 Fri   ░░▒▓▓ ▒░░▓▓ ▒▓░░▒ ░▒▓▓░ ▒▓▓░░ ░▓░▒▓ ░▓▒▓
       ▓▓░▒░ ▓▒▓░▒ ▓░▒▓▓ ▓░▒░▓ ░░▓▒▓ ▒▓░░▒ ▓░░▒
       ░▒▓▓▒ ░░▓▒░ ▒▓▓░░ ▓▒░▓▓ ▓▒░░▒ ░░▓▓▒ ▒▓▓░
                            Less ░▒▓█ More
```

- Cell 11px, gap 3px, `rx: 2`. 53 columns × 7 rows = 371 cells.
- Month labels sit above the first column whose week contains the 1st of that month.
- Weekday labels on alternating rows only (Mon/Wed/Fri), matching GitHub — full labels crowd the gutter.

**Mobile / <640px — transposed.** 7 columns (weekdays) × N rows (weeks), flowing **vertically** with the rest of the page, oldest week at the top.

A horizontally-scrolling year grid on a phone is a well-known annoyance: it traps vertical scroll, hides most of the data, and fights the page. Transposing costs one media query and makes the whole thing a natural part of the page flow. Cells go to 18px with a 5px gap for thumb-sized hit areas, and the mobile view defaults to the trailing 20 weeks with a "Show full year" expander.

> **Revised during build.** An earlier draft put the newest week at the top, on the theory that recent activity should not need scrolling. That was solving a problem the layout does not have: because the grid sits in normal page flow rather than its own scroller, the whole block is reachable with the page scroll, and reversing time only makes the calendar harder to read. Chronological order stands.

### 4.2 Level mapping

```ts
function level(score: number | null): 0 | 1 | 2 | 3 | 4 | "rest" {
  if (score === null) return "rest"; // nothing was scheduled that day
  if (score === 0) return 0;
  if (score < 0.34) return 1;
  if (score < 0.67) return 2;
  if (score < 1) return 3;
  return 4; // everything scheduled, done
}
```

**Rest days are not failures.** A day with no scheduled habits renders as a hollow square with a 1px border rather than an empty fill, so a deliberate rest reads visually differently from a skipped day. Streaks step over rest days without breaking.

**Two grids, two rules for counted habits.** In the aggregate grid a counted habit is all-or-nothing: it is either done or it isn't, and it contributes one unit to the day's score. In a single habit's own grid (`buildHabitHistory`) the level comes straight from `count / target`, so 5-of-8 is visibly different from 1-of-8. The distinction is not arbitrary — the aggregate score is _already_ a fraction, and a fraction of a fraction is not readable off an 11px square. Per-habit, there is only one fraction to show.

**Per-habit ramps are mixed, not hand-tuned.** Rather than six hand-built five-step scales in two themes, the habit grid mixes its accent toward the empty-cell colour in `oklab` at 30 / 55 / 78 / 100%. One formula, perceptually even steps, and both themes fall out of it.

Days before `createdAt` of every habit — i.e. before the user started — render at level `"rest"` with no tooltip. The grid should not imply a year of failure to someone who installed the app yesterday.

### 4.3 Rendering

**One `<svg>`, 371 `<rect>` elements, one delegated event listener on the root.** Not 371 React components with 371 handlers — that's ~15ms of hydration and a needlessly large commit on every tick. The rects are keyed by `data-date`; the listener reads `event.target.dataset.date`.

The grid re-renders only when the store version changes. `useMemo` keys on `[storeVersion, habitFilter, weekStartsOn]`.

**Selection, not a tooltip.** An earlier draft specified a hover tooltip on desktop and a bottom sheet on touch — two mechanisms for one job, and the hover half is unreachable on the platform most users are on. Instead a cell click selects the day and opens one panel below the grid, on every input type. The panel lists that day's habits as live rows, so the grid doubles as the backfill surface: seeing a gap and fixing it are the same gesture. The accessible name on each cell already carries the summary a tooltip would have shown.

### 4.4 Accessibility

Color alone must never carry the level. The grid is a `role="grid"` with `role="gridcell"` rects, each with:

```
aria-label="14 August 2026: 3 of 4 habits completed"
```

Keyboard support uses **roving tabindex** — the grid holds a single tab stop, and arrow keys move a virtual cursor between cells (`←/→` by day, `↑/↓` by week, `Home`/`End` to week bounds, `PageUp`/`PageDown` by month). `Enter` opens that day's detail sheet.

A visually-hidden `<table>` alternative is _not_ needed; the labelled grid is sufficient and cheaper. But the Stats page must also present the same information as text ("You completed 82% of scheduled habits over the last 30 days"), because a 371-cell grid is a poor primary read for a screen reader user regardless of labelling.

### 4.5 Reading the grid back — `lib/insights.ts`

> **Added after the first release.** The grid answers "what did my year look like". It does not answer "what is going wrong", and that is the question a habit tracker exists to help with.

Three rollups, all of them functions of the `DayStat[]` the grid was already built from. Nothing new is stored, and §3.1's rule holds unchanged: **derived data is never persisted.**

- **By weekday.** The most actionable number in the app. "You miss Saturdays" is something a person can act on; an overall completion rate is not. Counted in **habit-days**, not whole days — one bad Saturday out of twenty must not read the same as twenty half-done ones.
- **By calendar month.** Calendar months rather than rolling 30-day windows, because a trend is read against the months a person remembers living through and "March" is a label they already have. This is the one read that needs its own window: the grid's starts on a week boundary partway through a month, so `lib/dates.ts:startOfMonth` supplies whole months instead and the first bar is not a fraction of one standing beside five whole ones.
- **Per-habit streaks.** The aggregate streak at the top of Stats breaks the moment _any_ habit is missed, which makes a 40-day run on one habit invisible — and that run is the number the person actually wants. Built through `buildHabitHistory`, so a counted habit is scored the way its own grid scores it.

**A null rate is a real answer and is drawn as one.** "Nothing was ever scheduled on a Sunday" and "every Sunday was missed" are different observations and must not look alike — an empty track, never a zero-width bar in a full one. This is §4.2's rest cell, applied a second time.

**The weekday headline refuses to print more often than it prints.** `weekdayExtremes` names a best and worst day only when both ends carry enough scheduled habit-days to mean anything (`MIN_SAMPLE`) _and_ the gap between them is wider than a single missed day could produce (`MIN_SPREAD`). An app that tells you Tuesdays are your weakness on the strength of one Tuesday is worse than an app that says nothing.

### 4.6 The grid as an image — `lib/share-card.ts`

> **Added after the first release.** Social features are a v1 non-goal (§1) and this is not one: nothing is posted, no account is involved, and the file goes wherever the user's own share sheet sends it. It is an **export** — G5's "the data is theirs" pointed at the one screen G2 calls the emotional payoff.

**Drawn to a canvas, not screenshotted.** `components/Heatmap.tsx` renders SVG sized for a phone, carrying a keyboard cursor, selection rings and month gutters that belong to an interface rather than to a picture; serialising it would also mean inlining every CSS variable it resolves against. The card has its own layout at its own size.

**Fixed cell metrics, variable canvas.** The grid is the subject, so a cell is 22px whether the card covers twenty weeks or fifty-three, and the canvas is sized to fit — down to a floor width, below which a short window would come out as a strip rather than a card. `geometry()` is exported and tested, because an off-by-one there puts the last week over the edge of the image and still looks like a card.

**Colours are resolved by the browser, not by us.** The tokens are custom properties and two of the ramps are `color-mix` or relative-colour expressions on top of them — none of which `ctx.fillStyle` parses. Each is assigned to a throwaway element and read back through `getComputedStyle`, which is the only thing that knows the current theme, skin and palette (§6.5, §6.6). A card therefore comes out in whatever the user is looking at.

**Share sheet where there is one, download where there is not.** `navigator.canShare({ files })` is checked with the actual file rather than by testing for the API — desktop Chrome has `navigator.share` and refuses files. A cancelled share sheet throws `AbortError`, which is a completed interaction and not a failure to report.

The rendering happens on the tap and nowhere else. Drawing a megapixel canvas on every visit to Stats would charge every user for a feature most of them will never use.

---

## 5. The daily card

### 5.1 The deck algorithm

The requirement is "feels chosen": no repeat until every quote has been shown, identical output on every device, and no server call.

A plain `hash(date) % N` fails this — the birthday problem means duplicates appear within weeks. Instead, treat the corpus as a deck that is reshuffled once per full pass:

```ts
const EPOCH = "2026-01-01";

function quoteForDay(day: DayKey, deck: Quote[]): Quote {
  const i = daysBetween(EPOCH, day); // integer day index
  const cycle = Math.floor(i / deck.length);
  const pos = ((i % deck.length) + deck.length) % deck.length; // handles i < 0
  const shuffled = shuffle(deck, mulberry32(hashCycle(cycle)));
  return shuffled[pos];
}
```

`shuffle` is Fisher–Yates driven by `mulberry32`, a 32-bit PRNG that is ~10 lines and deterministic across engines.

> **Revised during build — the seam.** A per-cycle shuffle guarantees each quote appears once per pass, and says _nothing_ about the join between passes. The last quote of one cycle can open the next, and "I read that two days ago" is exactly the experience the deck exists to prevent. `deckForCycle` therefore pushes anything shown in the closing `k` days of the previous cycle out of the opening `k` positions of this one, with `k = ⌊size / 8⌋`.
>
> To avoid recursing back through every cycle that ever was, swap targets are drawn from `[k, size − k)` and never touch the final `k` slots — which is what makes the previous cycle's tail readable off its _raw_ shuffle. The guarantee is now stated exactly, in both the code and the UI: every quote appears once per pass, and no quote can repeat within `k` days (currently 21).
>
> This was found by a test written for something else. `upcomingSchedule` originally scanned one deck length forward and asserted full coverage; it reached 131 of 168, because a window starting mid-cycle is the tail of one shuffle plus the head of a different one. It now scans two cycles, which is guaranteed to contain one whole aligned cycle.

Consequences worth noting:

- **Stateless.** Nothing is persisted about which quotes have been seen. Reinstalling the app doesn't reset or disturb the sequence.
- **Time travel works.** "Yesterday's quote" and next week's are computable, which makes the `/quotes` archive view free.
- **Filtering by tag changes the deck**, and therefore the sequence. Accepted: a user who filters is asking for a different stream. The filtered deck is derived at boot and cached.

### 5.2 Corpus

`data/quotes.ts` — a typed module rather than JSON, so the tag union is checked at compile time instead of trusted at runtime.

It ships in the client bundle. The original plan kept it server-side and sent only the rendered quote across the boundary, but the day has to be resolved on the client (§7.1), so the selection function has to run there too. At roughly 150 bytes an entry this is a few KB gzipped — cheap enough that the archive view gets to be free as well.

**Sourcing constraint:** every quote must have a verifiable attribution with a `source` field where one exists. Misattributed quotes are the standard failure mode of this genre of app (Einstein, Twain, Gandhi and Emerson get credited with roughly everything). A quote whose attribution can't be traced doesn't ship, and where a popular attribution is _wrong_ but the line is worth keeping, a `note` field carries the correction rather than propagating the error — "We are what we repeatedly do" is filed under Will Durant, who wrote it, not Aristotle, who didn't. `lib/quotes.test.ts` asserts that specific correction so it can't silently regress.

The corpus is **168 verified quotes**, spanning antiquity through the twentieth century. That is a full pass every 168 days with a guaranteed 21-day minimum gap — short of the ~400 the algorithm would like, and the remaining distance is the honest limit of what could be attributed with confidence rather than a lack of effort. Getting to 400 means checking candidates against primary sources; padding it with plausible-sounding lines would defeat the point of having the constraint at all.

Two tests guard the corpus: ids are unique, and no two entries share the same opening text (a duplicate slipping in would quietly break the no-repeat property).

### 5.3 Fun facts, as a second corpus

> **Added after the first release.** Not everybody wants to be told to persevere over breakfast. `Settings.dailyMode` switches the daily card between `"quotes"` and `"facts"`; the habit tracker is untouched either way.

**It is a second corpus, not a second app.** The deck algorithm moved out of `lib/quotes.ts` into `lib/deck.ts`, generic over anything with an `id`, and the two corpora each bind it (`lib/quotes.ts`, `lib/facts.ts`). They run _independent_ sequences: switching modes drops you wherever the other deck's date maths says you are, rather than restarting it, because the sequence is a pure function of the date and the date does not care what you read yesterday.

**A `Fact` is a sibling of `Quote`, not a variant of it.** A quote has an author and, where traceable, a source; a fact has no author at all, so its `source` — where the reader can _check_ it — is required rather than optional. Modelling facts as authorless quotes would have made `author` optional on both and lost the constraint that keeps the quote corpus honest.

`lib/daily.ts` is the one module that knows both. It flattens either into a `DailyItem` — `text`, a `byline` (a quote's author, a fact's source), an optional `detail` (a quote's source), and an optional `note` — so the card's three skins and the collection view stayed single-variant. Without it, every screen would carry a quote branch and a fact branch, and the second corpus would have doubled the UI.

**Sourcing bar, inherited but aimed differently.** The quote corpus's failure mode is misattribution; a fact corpus's is the plausible factoid nobody ever checked — "we use 10% of our brain", "the Great Wall is visible from space". So the rule is the same shape (no source, no ship; `note` carries the correction where the famous version is wrong) but points at the claim rather than the speaker. The corpus is **85 facts**, giving a full pass every 85 days and a guaranteed 10-day gap.

**The mode syncs; appearance still does not.** It sits in the settings blob beside `weekStartsOn` and `reminderHour`, because it decides _what the app says to you_ rather than how it looks (§13.8 #1). `parseSettings` accepts it as optional and checks it against the union rather than against `string`, for the reason `haptics` is optional: a device on an older build pushes a blob without it, and an unrecognised mode would reach every other device and leave the card with no corpus to draw from.

**Favourites are one list across both.** The ids are distinct, nothing has to be migrated, and a saved thing does not vanish because the mode changed — the collection view counts the saved items _in the corpus on screen_ rather than the length of the list.

### 5.4 Narrowing the deck by tag

> **Added after the first release.** Both corpora were already tagged, and the tags were used only to filter the collection view. `Settings.dailyTags` points the same tags at the deck: pick `courage` and `discipline`, and those are the quotes the card draws from.

**One flat list across both corpora**, exactly like `favourites` and for the same reason — the two tag unions are disjoint, so the mode on screen decides which half is read and the other half sits harmlessly by. A test pins that disjointness, because the day they overlap is the day picking a quote tag silently narrows the facts too.

**Filtering to nothing is not an empty deck.** A selection naming no tag this corpus has falls back to the whole corpus (`deckFor`). Two ordinary situations produce it — someone who has only ever picked fact tags looking at a quote, and a tag from a build this device has not installed yet — and a card with nothing on it is a worse answer than a card that ignored a filter.

**`string[]`, not `(QuoteTag | FactTag)[]`.** `parseSettings` checks the field for shape rather than membership. The unions grow; a device on a newer release must not have its whole settings blob refused — habits and all — over a tag name this build has never heard of. This is the same reasoning that makes `haptics` and `dailyMode` optional, taken one step further, and `lib/daily.ts` narrows by intersection so an unknown tag can only ever narrow nothing.

**Every question about the sequence takes the same tags.** `dailyForDay`, `scheduleFor`, `deckCountFor` and `repeatGapFor` all read the filtered deck. Miss one and the collection's "in 12 days" column starts describing a deck the card is not using. In particular `repeatGapFor` reports the _filtered_ gap: narrow the tags far enough and quotes repeat sooner, and the settings screen says so rather than reprinting a number from the full corpus.

`countFor` is deliberately the exception — it is what there is to _browse_, and the collection still shows the whole shelf.

### 5.5 Creatures — `lib/creatures.ts`

Every finished week in which at least `QUALIFYING_RATE` (80%) of scheduled habit-days were done discovers the next creature in `data/creatures.ts`, in the corpus's order. The week in progress never counts, since it isn't over yet, and a week with nothing scheduled neither counts nor breaks anything.

**Derived, never persisted**, like streaks: `/dex` rebuilds the history from the first habit and counts. So nothing syncs and every device agrees. The cost is that deleting a habit deletes its entries, which can un-qualify a week and take a creature back. Archiving doesn't do this. If that ever matters, persist a discovery map in `Settings`.

**A discovered creature idles; a silhouette does not** — coming alive is part of finding it. Each loop acts out its own blurb, so no two share a move: Sproutle's leaf is watered, Pebblit does everything twice, Mossback grows moss by keeping still and loses it when it moves. A creature's `rig` lifts boxes of its sprite out as parts and adds effect pixels; `app/dex/idle.css` animates them in whole sprite pixels held with `step-end`, so the art never leaves its grid. Effect pixels are hidden at rest, which is why the global reduced-motion rule, cutting every loop short, leaves each creature in its drawn pose. Tapping a discovered creature makes it hop, on a group of its own inside the sprite so the hop composes with whatever its idle loop is moving; a silhouette is not a button.

**Every sprite is original.** They are pixel maps drawn in the corpus file, not image files. Art from elsewhere ships only under a licence that allows it, and never a character someone else owns: no Pokémon, no Poké- names, no ball iconography.

---

## 6. Visual design

### 6.1 Foundations

| Token          | Value                                             | Use                                             |
| -------------- | ------------------------------------------------- | ----------------------------------------------- |
| Type — display | Geist Sans, 600, `-0.02em`                        | Screen titles, numbers                          |
| Type — quote   | A serif (Newsreader or Lora), 400, `1.55` leading | Quote body only                                 |
| Type — UI      | Geist Sans, 400/500                               | Everything else                                 |
| Type — numeric | Geist Mono, `tabular-nums`                        | Streak counts, percentages                      |
| Radius         | `8px` controls, `16px` cards, `2px` heatmap cells |                                                 |
| Spacing        | 4px base scale: 4 · 8 · 12 · 16 · 24 · 32 · 48    |                                                 |
| Min hit target | 44 × 44px                                         | Non-negotiable on touch                         |
| Min field type | `16px`                                            | Text fields and selects, touch only — see below |

Both minimums are platform rules rather than taste. Under 16px, a touch browser
zooms the viewport in when a field takes focus and does not zoom back out — the
add-habit form autofocuses, so every new habit left the app scaled up. The floor
lives in `app/globals.css` as an unlayered `@media (pointer: coarse)` rule over
text inputs, so the designed scale is unchanged on a pointer device and a size
utility cannot quietly reintroduce the bug; selects are outside it (their own
sizes vary) and carry the floor themselves. The one-line alternative,
`maximum-scale=1` on the viewport, fixes it by taking pinch-zoom away from
everyone — a worse trade than a 1px type change on a phone.

The serif for quotes is deliberate — it separates "something to think about" from "something to do" without needing a border or a label.

### 6.2 Color

Defined as CSS custom properties on `:root` in `app/globals.css`, consumed through Tailwind v4's `@theme`. Light is the base definition; dark overrides only the tokens that change, under both `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` so the manual toggle wins in both directions.

Heatmap ramp (the neutral "all habits" scale):

```
level 0   #ebedf0 / dark #161b22   ← empty
level 1   #9be9a8 / dark #0e4429
level 2   #40c463 / dark #006d32
level 3   #30a14e / dark #26a641
level 4   #216e39 / dark #39d353
rest      transparent + 1px border in --border
```

Per-habit views recolor the ramp using the habit's `color`. Six habit colors ship (green, blue, violet, amber, rose, teal), each with a validated 5-step ramp in both themes. Level 1 must clear 3:1 contrast against the page background in both themes — the palest step is where these ramps normally fail.

**Any other color is pickable too**, from an `<input type="color">` sitting after the six swatches — a native wheel rather than a bundled picker, so it costs nothing and is the control the platform already taught the user. It stores the raw `#rrggbb`, and that is the whole of the difference: a palette key resolves through a custom property and so has a light value and a dark one, while a picked hex has only itself.

That is what `lib/colors.ts:habitColor` reconciles. A hex is emitted as `oklch(from <hex> clamp(var(--habit-l-min), l, var(--habit-l-max)) c h)` — hue and chroma exactly as picked, lightness pulled into the band the shipped palette occupies in the active theme (0.40–0.64 light, 0.70–0.88 dark). The clamp is what keeps the 3:1 floor above true for colors nobody validated: without it "any color you like" includes navy on the dark background and yellow on the light one. Both bounds are theme tokens rather than JS, because the theme is not known at prerender (§7.1) and a picked color must not be a reason for a screen to render differently on the server.

The form previews the resolved color, not the raw one, so the swatch and the habit agree.

### 6.3 Motion

Motion exists to confirm the tick and to reward the streak. Everything else is instant.

| Interaction                        | Treatment                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tick a habit                       | Checkbox scales `1 → 1.15 → 1` over 180ms, `cubic-bezier(.34,1.56,.64,1)`; row background flashes the habit color at 8% opacity |
| Completing the last habit of a day | Grid cell pulses once; a brief confetti burst, capped at 12 particles and once per day                                          |
| Tab change                         | Cross-fade 120ms, no slide (slides fight the browser's back gesture)                                                            |
| Streak increment                   | Number rolls up with `tabular-nums` so the layout doesn't jitter                                                                |

All of the above is wrapped in `@media (prefers-reduced-motion: reduce)` → duration 0, state change only. The reduced-motion path must still _confirm_ the action; it just does it without animating.

### 6.4 Haptics

The other half of confirming a tick, for the case §6.3 cannot reach: on a phone the thumb is over the target it just pressed, so the checkbox pop is the confirmation most likely to be hidden under the hand that caused it. `lib/haptics.ts` buzzes instead.

| Event                            | Pattern (ms)   |
| -------------------------------- | -------------- |
| A step towards the target        | `12`           |
| The tick that reaches the target | `[12, 45, 26]` |
| Wrapping back to zero            | _nothing_      |

Two rules. The patterns are **short** — a tick is an acknowledgement, not an alert, and anything long enough to register as a _buzz_ is long enough to be irritating by the fifth habit of the morning. And completion differs **structurally**, not by length: a gap is recognisable through a pocket where 12ms against 20ms is not.

Silence on the wrap to zero is deliberate. That press is a correction, and confirming it the same way as a tick makes undoing feel like recording.

It lives in `store.toggleEntry`, which every tick target in the app funnels through — three call sites (`HabitRow`, the week grid, `HabitDetail`) that would otherwise each have to remember. `navigator.vibrate` is absent on iOS and on any browser without a motor, so it is feature-detected and wrapped: the entry is already written by the time it runs, and a device that cannot buzz loses nothing else.

**Not gated on `prefers-reduced-motion`.** That setting is about visual motion and the vestibular symptoms it provokes; a vibration provokes none of them. Overriding an explicit "haptics: on" from a preference the user set for an unrelated reason reads as a bug, so `settings.haptics` is the only authority.

`haptics` rides the synced settings blob rather than sitting device-local beside `skin` (§6.5). The distinction is that a skin is a _look_ — picking one on a phone silently repaints a laptop, which §13.8 #1 already records as a wart for `theme`. Haptics is inert on hardware that cannot vibrate, so propagating it costs a desktop nothing, and someone who turns the buzz off on one phone means it on the other. The toggle stays visible everywhere for the same reason: hiding it on a desktop removes it from the screen a user is most likely to be configuring their phone from.

### 6.6 Custom palettes

The third appearance axis. `theme` is light or dark, `skin` is which design, and a palette is which **colours** — all three compose. A custom palette under `blocks` is still hard-edged, uppercase and 2px-bordered; only the hexes change.

`lib/palette.ts` is the pure half (what a palette is, how one is derived, what it measures), `lib/theme.ts` owns storage and the pre-paint script, `lib/use-palette.ts` is the React and DOM surface, and `components/PaletteEditor.tsx` is the screen, at `/settings/colours`.

**Twenty tokens, both modes.** Every colour a skin defines: four surfaces, two text roles, six accent/state colours, the quote trio, and the five-step ramp. A palette is `{ light: Swatches, dark: Swatches }` and is always complete — `normalisePalette` rejects a partial one rather than letting the rest fall through to whichever skin happens to be active, which would make the same saved colours render differently depending on a setting the palette has already overridden.

Three things are deliberately **not** in it. The six habit accents, because a habit's colour is its identity across the app and each habit already takes any colour on its own (§6.2) — a palette changes the room, not which habit is the blue one. `--habit-l-min` / `--habit-l-max`, because they describe the band the _theme_ occupies, which is the axis they already track. And radius, border width, shadow and type, because those are the skin's job; a palette that moved them would be a fourth skin under another name.

**It wins by being inline.** Every skin defines its tokens through `:root[data-skin=…]`. A palette is written to the document element's `style`, and an inline declaration beats any selector regardless of specificity. So `app/globals.css` needs no fourth block and no skin needs to know palettes exist. The pre-paint script in `lib/theme.ts` writes them before first paint alongside `data-theme` and `data-skin`, so a custom palette cannot flash either.

The script resolves which half applies — `data-theme` when set, `matchMedia` when not — because an inline style cannot carry a media query. That is also why `watchPaletteMode` exists: the light/dark swap CSS does for free has to be done by hand, from `Hydrator`, and `applyTheme` re-applies the vars so every existing caller in `lib/store.ts` gets it without knowing why. The script's two regexes are load-bearing: stored values go straight into a style declaration, so it accepts a custom-property name and a six-digit hex and nothing else.

**Device-local, like skin and for the same reason** (§13.8 #1): `localStorage` alone, never the synced settings blob. Repainting a laptop because someone tried a colour on their phone is a wart the design records once and should not repeat at twenty times the volume. The cost is that a palette is not in a backup and a new device starts on the skin's own colours. That is the intended trade.

#### Derivation, and why contrast is solved rather than chosen

Forty hand-picked hexes is not a thing to ask of anyone, so one seed colour builds the whole set. `deriveSwatches` fixes lightness for the neutrals and _solves_ it for everything carrying text: `fitLightness` binary-searches OKLCh lightness until the pairing hits its target, because luminance depends on all three axes through two non-linear transfer functions and chroma is gamut-clipped on the way out — there is nothing to invert. Chroma is the seed's, scaled hard for the neutrals (enough to tint a surface, never enough to colour it) and left alone for the accents. Out-of-gamut is not a special case: `oklchToHex` reduces chroma until it fits, which is why the pale end of the ramp desaturates without being told to. Danger keeps its own hue — an error that follows the seed is not an error.

The result clears AA at every hue, which `tests/palette.test.ts` pins by auditing all 36 of them in both modes.

**Then the user can break it, and the numbers say so.** The shipped skins were measured once by hand at author time — the header of `app/globals.css` is that measurement written down. Nothing measures a palette typed in at runtime, so `audit` re-runs the twelve pairings a real screen actually puts together after every edit, and the editor prints each ratio beside its target. It does not refuse a failing colour: full control was the point. It just makes the choice an informed one.

Two rows are not WCAG. There is no standard for "a filled heatmap cell should be distinguishable from an empty one", but it is what most often goes wrong in a hand-built ramp. Their floors sit just under what the shipped skins already achieve — classic's level 1 is 1.19 on its empty cell, its border 1.21 on the page — because a floor the default theme would fail is a floor that teaches the user to ignore the panel.

**Seeding from the stylesheet, not from a copy of it.** "Start from this design" reads the active skin's own values back out through `getComputedStyle`, driving `data-theme` through both modes inside one task and restoring everything in a `finally`. Duplicating three skins' worth of hexes in TypeScript would be wrong within a release. Values a swatch cannot hold — `grid` sets `--quote-bg: transparent` — fall back to that mode's background, which is what it looked like anyway.

The editor previews the half being edited rather than the half on screen, since editing dark colours on a device in light mode otherwise repaints nothing visible. `viewport.themeColor` ships two media-scoped `theme-color` metas and both are rewritten in place rather than a third appended, because the browser honours the first tag whose media matches.

### 6.7 The habit form, on touch, is a bottom sheet

Creating and editing a habit opens `components/Sheet.tsx` **on a touch device**. Inline on a phone, the add form grew the page by its own height under the "New habit" button, so the act of starting a habit scrolled the list you were adding to; on the detail screen the edit form _replaced_ the actions and the note under them, and the page changed length twice per edit. A sheet leaves the screen behind it exactly where it was.

**It is a real `<dialog>`, opened with `showModal()`.** That is the whole reason to prefer it to a positioned div: the focus trap, Escape, the inert background and the top layer are the browser's problem, and the hand-rolled version is usually missing the ones a screen reader depends on. It is the same mechanism §8.4's install instructions already use — that one is a centred card, this one is anchored to the bottom edge, and the difference is CSS.

**A pointer keeps the inline form**, unchanged: the card takes the place of whatever opened it, with its own Cancel button and focus in the name field. The reasons above are all about a phone. A desktop page has the height to grow into, nothing is scrolled out from under the cursor, and a sheet clamped to the bottom edge of a 1400px window is a phone idiom in the wrong room. `HabitFormPanel` holds the two presentations so the choice is made once; the sheet itself is capped at 32rem and centred, for a tablet.

**The axis is `(pointer: coarse), (max-width: 639px)`** (`lib/use-media-query.ts:MOBILE`), and the union is deliberate. Pointer type is the honest question — a phone rotated to landscape is past every sensible width while still being the device a sheet exists for, and a width-only test would swap presentation, and throw the draft away with it, halfway through typing a habit name. But the pointer half is not always told the truth: a desktop browser's device emulation reports a _fine_ pointer unless touch emulation is switched on separately, which makes the phone layout unreachable from the machine it is being built on. The width clause only ever adds the sheet, never removes one, so it cannot reintroduce the rotation problem. §4.4's objection to two mechanisms was about offering hover _and_ touch paths to the same user; this offers each user one.

Motion lives in `globals.css`, not in React, because the exit half cannot be expressed in React at all: the browser drops a dialog out of the top layer the instant `close()` runs, so the sheet is gone before a transition could play. `transition-behavior: allow-discrete` on `display` and `overlay`, plus `@starting-style` for the entry, is what holds it on screen for both directions. An engine that does not know those keywords ignores the declarations and the sheet arrives and leaves instantly — which is what the reduced-motion block asks for anyway, so there is no separate fallback to maintain.

Two details that are not decoration:

- **In the sheet, focus starts on the close button rather than the first field.** The dialog's own focusing steps would land on the habit name input, and on touch that raises the keyboard over a sheet pinned to the bottom edge — the sheet opens and is immediately covered. `autoFocus` is therefore a prop the inline form sets and the sheet does not, rather than something the form decides for itself.
- **`html:has(dialog[open])` locks the page scroll.** A modal dialog makes the page behind it inert but not unscrollable, and a drag over the backdrop otherwise scrolls Today underneath the sheet. It cannot shift the layout sideways, because `scrollbar-gutter: stable` keeps the gutter reserved while the scrollbar goes.

`HabitForm` renders bare — no card, no heading. `onCancel` and `autoFocus` are the only two props that differ between the frames, and both are absent in the sheet: it owns dismissal through Escape, the backdrop and its close button, and a fourth way out is clutter rather than safety.

The inline form resets by unmounting, as it always did. The sheet cannot — it stays mounted while it animates out — so the call sites remount it with a `key` bumped **on open only**, which leaves the copy sliding away with its contents and still starts the next one clean.

### 6.8 Swiping between days and weeks

Today and Week each show one slice of a timeline, and on a phone the natural way to move along a timeline is to push it. **Swipe left for the next day/week, right for the previous.** Today gains a day offset it never had; Week already had one behind two arrows, and the gesture is a second way to reach it.

`lib/use-swipe.ts` is the whole mechanism, and `resolveSwipe` — the pure half — is where all three thresholds live, because a threshold is the part worth testing. A gesture counts as a swipe when it travels at least **40px**, stays within **0.6×** that distance off the horizontal, and completes inside **800ms**. The first keeps a tap a tap: the tick target is the most-used control in the app (§6.5) and it must survive a thumb that moved. The second is the one that matters most — a habit list exists to be scrolled vertically, and a thumb dragging down it drifts sideways by tens of pixels meaning nothing by it. The third rejects a slow drag, which is a scroll that changed its mind. _Narrowed by the week strip below:_ `resolveSwipe` takes its duration as an optional argument, and the drag path omits it. A slow gesture is only suspicious when nothing moved while it happened — once the row is following the finger, someone taking their time is someone taking aim.

Four decisions around it:

- **The arrows are the control; the swipe is the shortcut.** A gesture is announced to no screen reader and reachable from no keyboard, so Today gets the same `‹ Today ›` cluster Week has always had. Shipping the gesture alone would have made the feature invisible as well as inaccessible. _Reversed on Today by the week strip below:_ its circles and week arrows are buttons that reach any day from a keyboard, so Today's own `‹ Today ›` cluster was removed as a duplicate. Week keeps its arrows.
- **Touch and pen only.** On a desktop a horizontal drag is a text selection, and pretending otherwise breaks a habit name mid-highlight. _Reversed for the week strip below:_ the objection is to dragging across prose, and the strip has none — seven circles that are buttons and a four-word range line. It takes a mouse drag as well, and turns selection off for the length of one. The day list and Week keep the rule.
- **A swipe that starts on a habit still ends in a click.** The hook swallows that click in the capture phase, which is the only reason swiping across the list does not tick a habit off on the way past. The flag is cleared on the next press, so a swipe that landed on nothing cannot eat a later tap.
- **No `touch-action: pan-y`.** It is the obvious thing to reach for and it is wrong here: Week's grid is a table in a horizontal scroller, `pan-y` on an ancestor takes that axis away from it, and a descendant cannot give it back. The hook instead walks up from the press and declines the gesture if it began inside a scroller that can actually scroll sideways — so on Week the table scrolls and the weeks stay put. _Refined by the week strip below:_ the objection is to `pan-y` on an **ancestor of Week's table**, and it does not reach a surface with no sideways scroller inside it. The strip sets `touch-action: pinch-zoom` on its own `<nav>`, because without it a thumb that drifts downwards hands the touch to the page scroll, the browser fires `pointercancel`, and the gesture is dropped before `resolveSwipe` is ever reached — which was the dominant way a swipe across the strip went missing, well under any of the three thresholds. It read `pan-x pinch-zoom` first, and that is a trap worth naming: `pan-x` grants the browser the horizontal axis, and the compositor takes it the moment a touch is plainly horizontal, cancelling the pointer mid-gesture **even with nothing to pan**. Leaving only `pinch-zoom` gives the strip both axes and leaves zoom alone, which is nobody's navigation gesture.

**The week strip is a third way to the same offset.** Today opens with the browsed day's week as seven circles (`components/WeekStrip.tsx`); pressing one browses straight to it, and the strip turns over when a swipe on the list crosses a week boundary, because it follows the browsed day, not today. Its own `‹ ›` and a swipe across it move a **week** at a time, keeping the weekday; the list's move a day, and since the two sit in different slots a gesture only ever lands on one. A line above the circles names the week's range, because a swipe can change the week unnoticed, and off the current week it offers **This week**, which returns to today rather than to the same weekday. That line is always rendered, so the button appearing moves nothing. The offset lives in `components/BrowseDay.tsx` above the page's slots, since the strip and the list sit in different ones. The strip carries no `order`, so it stays on top even in `grid`, which moves the list above the daily card. It is also the one element in the app that claims a touch axis, per the bullet above, and the price is that its own band cannot be dragged to scroll the page — a fair trade for a short row whose reason to exist is a horizontal gesture.

**What does not move with the day.** The streak, the heat strip and the per-habit trails stay anchored on _today_. They are claims about the present: recomputing them per browsed day would show a streak that was never true, and a day in the future would score every day between here and there as missed. Splitting them into their own memo is also what keeps a swipe cheap — the browsed day is one pass over the habits, where the summary is a year of them.

**A future day is readable, not tickable.** `TickTarget` takes a `readOnly` prop and the header says why, which is the rule the week grid has always applied to its future columns. `AddHabit` hides itself off today for a related reason: a habit created now is not active on the day being browsed, so it would be added into a screen that cannot show it.

No slide animation. §6.3 rules slides out for tab changes, and the reasoning holds here too — the content changes, the heading changes, and the gesture is its own feedback. _Reversed for the week strip:_ its seven circles fade in across 32px in the direction of travel, over 700ms. §6.3's objection is to a slide that moves a whole screen, which is what competes with the browser's back gesture; a nudge inside one row competes with nothing. And the strip is the case the paragraph above gets wrong: the circles hold their positions and only the numerals under them change, so a week that turned over looks a great deal like one that did not — which is the same worry the range line was added for. The row sits in a box with `overflow-x: clip`, so neither the slide nor a drag can reach past the arrows beside it and give the page a horizontal scrollbar — `clip` rather than `hidden`, because `hidden` would make that box a scroll container, which is exactly what the gesture hooks decline to start inside; and it is padded by the width of a focus ring and pulled back by an equal negative margin, because a box clipped on one axis ignores `overflow-clip-margin`. The direction is read from the two weeks, not from the gesture handler, because the list's own swipe turns the strip over as well by crossing a boundary. The day list and Week still change without motion.

**The strip is dragged, not swiped** (`lib/use-drag.ts`). A swipe is read once, on release: nothing moves until the finger lifts. That suits the day list, where the content changing is its own feedback, and it is the wrong shape for the strip — whose whole problem, two paragraphs up, is that a week that turned over looks like one that did not. So the strip's row follows the finger, and **the weeks on either side come with it**: the one before and the one after are mounted for the length of the gesture, parked just outside the clip, and the drag is towards them. The row translates one-to-one as far as the 40px that would commit it, then with resistance to a 96px cap — far enough to bring a good part of the neighbour into view and no further, since a row that kept pace with a finger crossing the screen would read as something that could be thrown.

Let go short of the threshold and it springs back, having changed nothing. Let go past it and the neighbour is slid the rest of the way in, over 260ms, and **only when that transition ends does the browsed day move** — the week never changes under a row still in motion. The handover is why `transitionend` drives it rather than a timer: under `prefers-reduced-motion` the transition collapses to nothing and the day changes at once, which is the setting asking for exactly that. Three consequences have to be handled or the strip strands itself. A gesture starting mid-settle would replace the transform the transition is running and no `transitionend` would ever arrive, so the handlers come off the `<nav>` for those 260ms. A week changed by anything else mid-settle — a circle, an arrow — remounts the row and ends the settle in the same render. And the arriving week does **not** also play the fade-and-slide above: the drag already showed it arriving, and playing both moves the same row twice. Every other route to another week still gets that animation.

The neighbours are `aria-hidden` and `inert`, because a drag is not how a screen reader or a keyboard reaches another week — those have the arrows, and the tab order stays seven circles either way. Three more details are load-bearing. The axis is claimed at **8px**, well under `MIN_DISTANCE`, because claiming later would make the row jump to catch up with a finger already moving. The claim takes `setPointerCapture`, which touch gets implicitly and a mouse does not. And a drag that moved the row swallows its trailing click in the capture phase, exactly as the swipe does — otherwise a drag that finishes over a circle browses to that day on top of changing the week. The hook restates no threshold: `resolveSwipe` decides the release and `MAX_OFF_AXIS` the lock, both imported from `use-swipe.ts`.

### 6.9 To do above Done

Today splits the day's scheduled habits into **To do**, at the top, and **Done** below it, so the rows still waiting for a tick are the ones nearest the thumb. Not scheduled stays last and collapsed, as before. A counted habit is to do until it reaches its target: Water at 5/8 has not been done.

**Rows wait before they move.** `lib/today-split.ts` holds every row where it is on screen after a change, and releases the hold once ticking has paused for **700ms**. Moving a row the instant it is ticked fails twice: the pop that confirms the tick (§6.3) leaves with the row, and the row below slides up into the place the thumb is about to press. Any change renews the hold — a counted habit stepping from 5 to 6 included — so someone working down the list sees nothing move until they stop, and a mis-tap is undone in the place it happened. Another day, or the store finishing its load, is not a tick, and places rows at once. The move itself is not animated; §6.3 keeps motion for the tick. The state machine is pure and tested in `tests/today-split.test.ts`, because the timing is the whole feature.

**Done is a collapsible `<details>`, open by default** — the same element Not scheduled has always used, which is why the split reaches all three skins without a new component: Classic and Grid get it as rows, Blocks as a second grid of tiles. Done rows are not dimmed. A done name is already struck through in `--muted`, and `--muted` passes AA with no headroom, so it cannot take an opacity as well.

**Keyboard focus follows the habit.** Moving between sections remounts the button, and a removed element drops focus to `<body>`. `TodayList` puts focus back on the same habit in its new section, and only when the focused button is gone: a click on blank space also leaves focus on `<body>`, and must not be answered by jumping back to a row.

### 6.10 Editing from Today is a mode

Today can edit a habit without leaving the list, and the whole design is about not costing anyone a tick. An **Edit** button at the start of the day nav switches the list into edit mode: every checkbox becomes a pencil, every row gets a dashed edge, the line under the nav says ticking is off, and a press on a row opens the habit form (§6.7) — the sheet on touch, the inline card in the row's place on a pointer. **Done** switches back, and closes a form still open.

**A mode, because the row is already one button.** §6.5 makes the whole row the tick target, and a button cannot hold a second one. Three alternatives were prototyped and rejected:

- **Long-press for a menu.** Nothing opens by accident, but nothing tells anyone it exists either — the same objection §6.8 raised against a swipe with no arrows. It remains a candidate _shortcut_ on top of the mode, never a replacement for it.
- **A `⋯` button on every row.** Visible, but it takes 45px from every row's tick target, crowds Grid's trail and Blocks' corner, and a stray tap still lands somewhere.
- **Swipe a row to reveal Edit.** A horizontal swipe on Today already changes the day.

**`onEdit` replaces the tick rather than sitting beside it.** `TickTarget` renders a different button when it is given one: no `aria-pressed`, labelled "Edit …", never calling `toggleEntry`. So ticking and editing are never live at the same moment, which is the property the mode exists for, and it holds in all three skins without any of them changing layout. It outranks `readOnly`: a future day cannot be ticked, but its habits can still be edited.

The editor closes on any change of day rather than following the habit, because on the next day the habit may not be on the list to put a form in. Its habit id outlives the close, so the sheet sliding away keeps its contents. The inline form's wrapper carries `data-habit-id`, which is how §6.9's focus rule returns focus to the row once the form is gone.

---

## 7. Architecture

### 7.1 Local-first, with a static shell

IndexedDB is the source of truth. There is no server-side data in v1, which shapes how the Next.js layer is used:

```
┌─ Server Components (static, prerendered) ─────────────┐
│  • App shell: nav, layout, headers                     │
│  • Nothing user- or date-dependent (see below)         │
└───────────────────────┬────────────────────────────────┘
                        │ children / props
┌───────────────────────▼────────────────────────────────┐
│  Client Components                                     │
│  • <StoreProvider> hydrates from IndexedDB on mount    │
│  • Habit list, week grid, heatmap, all mutations       │
└───────────────────────┬────────────────────────────────┘
                        │ read/write
┌───────────────────────▼────────────────────────────────┐
│  lib/store.ts — in-memory cache + write-through to IDB  │
│  useSyncExternalStore subscription, version counter     │
└────────────────────────────────────────────────────────┘
```

**Hydration safety.** Server Components cannot read IndexedDB, so any component whose output depends on user data must render a skeleton on the server and the real value after mount. Mismatches here produce exactly the flash this app can least afford — a checked box appearing unchecked for 200ms reads as data loss. The store exposes `hydrated`; every data-dependent subtree gates on it.

**The date is client state too, and this is the trap.** The quote card was originally specified as a Server Component so it would land in the first paint. It cannot be. Every route here prerenders to static HTML, so a server-computed date pins _every_ visitor to the build day's quote until the next deploy — and request-time rendering would not save it either, because the service worker serves that HTML from cache afterwards. Showing the wrong quote and then correcting it is worse than showing none for a beat, so the card renders a fixed-height placeholder until mount. The selection is pure and synchronous, so it lands on the first client render rather than waiting on IndexedDB.

The current day is exposed through `useToday()`, a `useSyncExternalStore` subscription rather than a `setState` in an effect. The clock genuinely is an external system: React uses the server snapshot (`null`) through hydration and switches over cleanly afterwards, with no mismatch and no cascading render — and subscribing to `visibilitychange` means an app left open on a bedside table at 23:59 rolls over correctly at 00:01. React 19's `react-hooks/set-state-in-effect` rule flags the effect-based version, and it is right to.

The theme class is the one thing that must beat hydration entirely, and it is set by a tiny blocking inline script in `<head>` before paint, per the Next guide at `01-app/02-guides/preventing-flash-before-hydration.md`. Because IndexedDB is async and cannot be read before paint, the theme is mirrored to `localStorage` purely so that script has something synchronous to read.

### 7.2 The store

```ts
// lib/store.ts
let state: { habits: Habit[]; entries: Map<string, Entry>; settings: Settings };
let version = 0;

export function toggle(habitId: string, date: DayKey) {
  const key = `${habitId}:${date}`;
  const cur = state.entries.get(key)?.count ?? 0;
  const habit = getHabit(habitId);
  const next = cur >= habit.target ? 0 : cur + 1; // cycles 0→1→…→target→0

  state.entries.set(key, { habitId, date, count: next, updatedAt: Date.now() });
  version++;
  emit(); // synchronous — UI updates this frame
  void persist(key); // fire-and-forget IDB write
}
```

The optimistic path is the _only_ path. The UI never awaits the write. An IDB failure surfaces as a non-blocking toast and a retry queue; it does not roll back the UI, because on a local database a failed write is a bug to fix rather than a state the user should have to reason about.

Subscription goes through `useSyncExternalStore` — correct under React 19 concurrent rendering, and free of the tearing that an ad-hoc `useState` + event emitter would introduce.

### 7.3 Persistence

- **No wrapper library.** The original plan called for `idb`. The surface actually needed — open, `getAll` ×3, `put`, `delete`, `clear` — came to about 60 lines of `lib/db.ts`, which is less than the supply chain costs. Object stores: `habits` (keyPath `id`), `entries` (keyPath `["habitId","date"]`), `kv` (settings and other singletons). Deleting a habit's entries uses a bounded `IDBKeyRange` on the compound key rather than scanning the store.
- **Request persistent storage** on first habit creation: `navigator.storage.persist()`. Without it, IndexedDB sits in the evictable bucket and a year of streaks can be reclaimed under storage pressure. This is the single highest-value line of code in the persistence layer.
- **Export/import** as a versioned JSON blob (`{ version: 1, habits, entries, settings }`) from Settings. This is the v1 backup story and the v1 device-migration story. Import is offered as merge-by-`updatedAt` or full replace.
- **Migrations** keyed on the IDB `version` integer, with a documented upgrade function per version bump.

### 7.4 Undo — `lib/undo.ts`

> **Added after the first release.** Deleting a habit told the user it "cannot be undone" while the data model said otherwise: §13.4 writes a tombstone rather than dropping the row, so putting it back is a stamp change.

**One slot, not a stack.** This is a way out of the tap you just regretted, not a history. A stack would need every entry to stay valid as the ones beneath it were undone, and the actions worth undoing at all are the rare, loud ones. A second offer pushes the first out.

**The offer expires** (`UNDO_TTL_MS`). An undo sitting in a corner for ten minutes is a button whose meaning nobody remembers, and the payload it holds — a deleted habit's entire history — should not stay alive for a user who has moved on.

**It lives in the root layout, not beside what raised it.** The action that needs undoing is usually the last thing done on a screen before leaving it: deleting a habit navigates away from the habit. A bar owned by that screen would unmount with it, taking the only way back.

**Restoring re-stamps everything, and that is the whole trick.** The delete it undoes wrote a tombstone stamped _now_, which every peer and the server will apply. A habit restored under its original `updatedAt` loses that comparison — the undo would appear to work on this device and be quietly re-deleted by the next pull. The entries are re-stamped too, and for a stronger reason: `lib/server/sync-store.ts` **deletes a habit's entry rows outright** when its tombstone lands, so after a delete the record handed back by `deleteHabit` is the only copy of that history anywhere. Restoring has to push it again for it to exist at all.

**What is not undoable, and why.** "Delete all data" and a replacing import both sit behind a two-step confirmation in a section labelled as dangerous, and an undo bar under a deliberate, confirmed, destructive action makes it read as casual. The backup file is the answer there, which is what §7.3 says it is for.

`lib/store.ts:deleteHabit` returns what it removed; the caller decides whether to offer an undo. **The store does not import `lib/undo.ts`** — the dependency runs one way, as it does with sync.

---

## 8. PWA layer

Per `01-app/02-guides/progressive-web-apps.md` in this Next version.

### 8.1 Manifest

`app/manifest.ts` — the App Router file convention, typed as `MetadataRoute.Manifest`.

```ts
{
  name: "OpenHabits — daily quotes & habits",
  short_name: "OpenHabits",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#216e39",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [{ name: "Log today", url: "/" }, { name: "Stats", url: "/stats" }],
}
```

A **maskable** icon is required, not optional — Android crops non-maskable icons into a circle and will eat the logo's edges. Keep the mark inside the 40% safe zone.

### 8.2 Service worker

A hand-written worker at `public/sw.js`, ~80 lines, **runtime caching only**:

| Request                | Strategy                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| Navigations            | Network-first, falling back to the cached shell                       |
| `/_next/static/*`      | Cache-first — the filenames are content-hashed, so they are immutable |
| Other same-origin GETs | Stale-while-revalidate                                                |
| User data              | **Never touched by the SW** — it lives in IndexedDB                   |

The plan named **Serwist**, which the Next PWA guide points to. It is the right tool when you need a precise precache manifest with revision-hashed invalidation, and it is the documented upgrade path here. It is not what this app needs yet: precaching buys correctness in the gap between "asset changed" and "cache noticed", and content-hashed filenames already close that gap. Runtime caching gets full offline after one visit with no build-time coupling to keep in sync.

Because the data layer is entirely client-side, "offline" is nearly the whole app for free. The SW's only job is delivering the shell; there is no data-sync layer to reconcile.

> **Reversed in part: routes are precached, assets still are not.** "Full offline after one visit" was true of the data and false of the app, and the table above hid the reason — it has a row for navigations and none for the router. Only Today was reliably reachable offline; Week, Stats and Settings failed in three distinct ways, none of which show up online:
>
> - **A relaunch on any route but `/` drew Today under that route's URL.** The navigate fallback was `caches.match(request) || caches.match("/")`, and only a route the browser had loaded as a _document_ was ever in the shell cache. Inside a standalone app nothing does that except the launch itself, which lands on `start_url`. So the manifest's own `/stats` shortcut opened Today.
> - **A tab tap asked for a flight payload that could not be matched.** Soft navigation fetches `/week?_rsc=<hash>` — the hash is derived from the request and differs between a prefetch and a navigation — and Next answers it with `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`. Caching those responses under their own URL and matching them with a plain `caches.match` means an entry only ever matches a repeat of the exact request that stored it. Routes that happened to be prefetched from the page you were on worked; `/settings/colours`, which is prefetched from nowhere the launch visits, never did.
> - **`useOffline` made that failure silent.** §8.3's flag keeps a failed navigation pending instead of throwing, so there was no error, no fallback hard navigation and no feedback — the tab simply did not respond. Good behaviour for a slow server, and the worst possible presentation of a cache miss.
>
> The fix is a `ROUTES` list in `public/sw.js` naming the seven prerendered pages, precached at install as both halves — the document and the flight payload — and a fourth row for the router's fetches:
>
> | Request             | Strategy                                      |
> | ------------------- | --------------------------------------------- |
> | `?_rsc=` / `RSC: 1` | Stale-while-revalidate, **keyed by pathname** |
>
> Keying by pathname is what makes the entries findable at all: it drops the per-request `_rsc` hash, and rebuilding the response to store it drops the `Vary` header along with the 307 that `cache.put` refuses. It also means `/habit?id=…` needs one entry rather than one per habit — which is the payoff the search parameter was chosen for (see that page's own header).
>
> This is the build coupling the section above declined, so it is held by a test rather than by discipline: `tests/sw.test.ts` reads `app/` back and fails if a prerendered route is missing from `ROUTES`. A route that is absent renders fine in review and in CI, and fails only on a plane. `/reset-password` is excluded on purpose — the link arrives by mail and the form posts to the server, so a shell with nothing behind it is worth nothing.
>
> `VERSION` is bumped to `openhabits-v2`, which discards the old caches. A deploy does not bump it, so `install` cannot be what keeps the precache current; `revalidate()` re-runs it once per worker startup off the back of a successful network response — about once per launch, as conditional requests.

> **The asset cache is swept.** The same fact — a deploy does not bump `VERSION` — meant `activate` never discarded anything either, and content-hashed names are never overwritten, so every deploy's chunks piled up beside the last. Each stored asset now carries an `x-openhabits-used` stamp, refreshed on a hit at most daily, and `revalidate()` follows the precache with a sweep that drops anything unused for 30 days. Entries from before the stamp age by their `Date` header. Whatever the cached shell documents name is exempt at any age — those are the files an offline relaunch needs first, when nothing can refill them — and reading them out of the HTML can only widen what survives, so a change in how Next spells asset URLs degrades to age alone rather than to deleting the live build. Versioning the cache per deploy was the alternative and is worse: the page that registers the new worker has already fetched its chunks through the old one, so dropping the old cache on `activate` drops the new build's files with it.

It is registered only in production builds — a caching worker in development turns every HMR update into a debugging session about stale assets.

`next.config.ts` gets the headers block from the guide's §8: `no-cache` on the service worker file, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 8.3 `useOffline`

Not needed in v1 — there are no server round-trips to fail. It becomes relevant the moment v2 sync lands, at which point `experimental.useOffline` in `next.config.ts` plus the `useOffline()` hook from `next/offline` gives connectivity-aware fallbacks and automatic retry of failed Server Actions. Noted here so the v2 work knows the hook exists rather than hand-rolling retries.

> **Adopted, and the expectation above was half wrong.** The flag is on and `lib/sync/client.ts` uses the hook — but **it does not retry sync for us**. Next retries its own navigations, prefetches and Server Actions; `POST /api/sync` is a plain `fetch` from a Client Component and stays under the client's own policy, which is the hand-rolled one. What the hook actually buys is a _truthful_ answer to "are we offline". `navigator.onLine`, which the client used before, reports true for a device on wifi with no route to the internet — a captive portal, a dead upstream — and the framework polls the origin instead. See §13.14.

### 8.4 Install prompt

**Reversed.** The original decision, per the guide's recommendation, was no `beforeinstallprompt` interception: it isn't supported on iOS Safari, so a hand-rolled button produces a two-tier experience — a real button on Chromium and nothing on the platform that most needs the help. What shipped instead was a passive text hint (`InstallHint`).

That reasoning holds only if the second tier is _nothing_. `components/DownloadAppButton.tsx` handles the split rather than avoiding it, so the app now does intercept:

- **Chromium** — `beforeinstallprompt` is caught at module scope (it fires before React hydrates, and only once) and `preventDefault()`ed, so the browser's own bar does not compete with ours. The button replays it on click. The event is one-shot: once spent, the state falls back to the manual sheet.
- **Everywhere else** — a `<dialog>` with the actual steps, keyed off the user agent, because "tap Share" is wrong advice in Chrome on iOS (the menu is under ⋯) and useless inside the Instagram or TikTok webview, which cannot install at all. That last case gets a **Copy link** button instead, which is the only thing that helps there.

Install state is exposed through `useSyncExternalStore` over `matchMedia("(display-mode: standalone)")` plus iOS Safari's older `navigator.standalone`. **The server snapshot claims "already installed"**, so no install UI is in the prerendered HTML — it only ever appears, never disappears, which keeps §2's static-prerender rule intact. `InstallCard` (same module) is the Settings-screen presentation and is gated on the same state, so the card never wraps a button that rendered null.

### 8.5 Reminders — a known limitation, since lifted

**The web cannot reliably schedule a purely local notification.** The Notification Triggers API never shipped broadly, and a service worker cannot wake itself on a timer. There are two honest options:

1. **v1 — in-app only.** A gentle "you haven't logged today" banner when the app is opened after the reminder time. Zero infrastructure, zero permissions, no false promises.
2. **v2 — real push.** Web Push with VAPID keys, `web-push` on the server, and a stored subscription per device. Works on iOS 16.4+ _only for home-screen-installed apps_. This requires a server and a scheduler, which pulls the app out of its zero-backend posture — hence v2.

**Originally shipped:** neither, and the Settings screen said so in plain words. The Today tab already surfaces what is outstanding the moment the app opens, which is option 1 without pretending it is a reminder. A "Daily reminder at 8:00" toggle that silently doesn't fire would be the worst available outcome.

#### Reversed: option 2 shipped

The objection to v2 was that push "pulls the app out of its zero-backend posture". §13 has since given the app a server, a database and accounts, so that objection is spent — and it was the _only_ objection. **The warning underneath it is not, and it shapes everything below: a toggle that silently doesn't fire is still the worst available outcome.**

The scheduler is a **cron running hourly**, not daily. "9am" is a wall clock, and one daily invocation can only ever be nine o'clock in a single timezone; it would reach Sydney at dinner. So every subscription stores the **IANA zone of its browser**, and `lib/server/reminders.ts` asks per device whether it is that user's `reminderHour` _there_. `lib/dates.ts:civilInZone` is the one place that reads a clock in somebody else's zone, and it honours `dayStartHour` — so the habits the notification lists are exactly the ones the Today tab would show if the app were opened as it landed.

**The schedule moved off Vercel Cron.** It was declared in `vercel.json` and the deploy was rejected: Hobby caps cron at one run per day, which is the one shape this feature cannot take. Hourly was not negotiable, so the scheduler was — `.github/workflows/reminders.yml` now curls `/api/cron/reminders` on the hour with the `CRON_SECRET` bearer. The route did not change, and neither did anything downstream of it: the sweep was always written to be called by something at-least-once and slightly late. What is bought back in cost is paid in punctuality — GitHub's scheduler runs late under load and stops firing after 60 days without a push — and in one new way to be silently off, since a deployment behind Vercel Authentication answers the sweep with an SSO redirect rather than a 200. The workflow fails on any status but 200 for exactly that reason: per the warning above, a toggle that silently doesn't fire is the worst available outcome, and that now includes the scheduler.

**And then off GitHub Actions.** Of the two costs above, lateness was the one worth paying and the sixty days were not: that clock runs out for the one reason a finished feature is _likely_ to hit — nobody pushing to it — so the scheduler was arranged to stop precisely when the app had settled down. `workers/reminders.ts` replaces it with a Cloudflare Worker cron trigger on the same `0 * * * *`, which has no such condition, and once again nothing downstream moved: the Worker holds no logic, knows nothing about timezones or push, and does what the workflow's `curl` did — one authenticated GET, fail on any status but 200. What is genuinely lost is the red run and the mail that came with it. So the Worker `await`s the fetch rather than handing it to `ctx.waitUntil`, and throws rather than logging, because a throw is the only thing that marks a cron invocation failed; `observability` is on in `wrangler.jsonc` so there is somewhere for the body to land. **Someone still has to go and look, or wire an alert** — per the warning above, the scheduler remains one of the ways this toggle can silently not fire, and it is now the way with the quietest failure.

Wrangler is not a dependency of this project, and the Worker has no build step of ours: it is TypeScript because wrangler bundles `.ts` itself and the app's `tsc` then checks it for free, and it is thirty lines deployed by hand about as often as the schedule changes, and pulling a toolchain carrying platform binaries into every Vercel build to avoid typing `npx` is the wrong trade.

**When, and whether, are stored in different places, because they are different kinds of fact.**

|                                     | Lives in                                                           | Scope       |
| ----------------------------------- | ------------------------------------------------------------------ | ----------- |
| **Whether** this device is reminded | `push_subscriptions`, keyed by endpoint                            | One browser |
| **When** the reminder is due        | `Settings.reminderHour` and `eveningReminderHour`, the synced blob | The account |

The subscription table is the only one here not keyed by `(userId, …)` — see `lib/server/schema.ts`. A push endpoint is the push service's global handle for one browser, so keying it per user would let two accounts hold live rows for the same device, and signing out would leave the previous owner's habits arriving in somebody else's tray. Signing out unsubscribes for the same reason.

**Delivery is claimed before it is attempted.** `last_sent_day` is written by the same `UPDATE … RETURNING` that selects which devices to send to, so an at-least-once cron delivers once; the payload's fixed `tag` is the second line of defence, in the tray. A day on which everything was already done is claimed and left silent — finishing before nine should mean quiet, not a reminder held back until the hour ticks over.

**Added: a second slot.** `Settings.eveningReminderHour` is an optional last call for whatever is still outstanding at the end of the day. `null` is off and it ships off, because a field added to a synced blob must not start waking devices that never asked. It is claimed on its own column, `last_sent_evening_day`: one `last_sent_day` cannot say _which_ of two reminders went, so a shared claim would let the morning silence the evening for the rest of the day. The two hours are checked morning-first, which makes both set to the same hour one reminder rather than two. Nothing else moved — the day is still decided in the device's zone, the body still lists what `habitsForDay` says is outstanding, and a day already finished is still claimed and left silent, which in the evening is the common case.

**Two new endpoints** (a third since — `/api/email`, §13.16), which is the first time §7.1's "`POST /api/sync` is the only one" has bent. Neither carries user data in the sync sense: `/api/reminders` registers a device fact that is deliberately _not_ replicated (every device would otherwise hold a copy of every other device's push endpoint, for nothing), and `/api/cron/reminders` is the scheduler's entry point. The cron route fails closed — with no `CRON_SECRET` it refuses to run at all, because it reads every account's habits and sends to every registered device.

**What the honesty requirement bought.** `GET /api/reminders` is asked _before_ `Notification.requestPermission()`: a browser grants that prompt once, and spending it on a deployment with no VAPID keypair leaves the user with a permission given for nothing. `lib/reminders.ts` names every way a reminder cannot arrive as its own status — no Push API (Safari on iOS until the app is installed), no service worker (a development build never registers one), deployment not configured, not signed in, notifications blocked — and `components/ReminderCard.tsx` says which one out loud instead of showing a switch over it. Six branches for what is nominally a checkbox, and that is the point.

**Still true, and still a limitation:** on iOS this works only for a home-screen-installed app, and a reminder cannot be scheduled locally at all. Nothing here changes that; it routes around it with a server.

### 8.6 Page metadata

The root layout owns the shared half: `title.template` (`"%s · OpenHabits"`), the description, `applicationName`, `appleWebApp`, `formatDetection`, and an `openGraph`/`twitter` pair. Each route then adds its own `title` and `description`.

Two constraints shape where that per-route metadata lives.

1. **`title.template` applies to child segments, never to the segment that declares it.** So the root `title.default` _is_ the Today title; `app/page.tsx` exports no metadata of its own.
2. **`metadata` is only read from Server Components**, and `/week`, `/stats`, `/settings` and `/quotes` are all client components — they own screen-local state (selected week, expanded habit, search text). Rather than split each screen into a server shell plus a client body, each gets a `layout.tsx` that exports the metadata and returns `children` unchanged. It adds a segment and no markup.

`/habit` is `robots: { index: false, follow: false }`: the habit comes from `?id=`, so the bare URL a crawler would index renders nothing.

**No `metadataBase`, and no OG image.** There is no canonical origin for the app yet, and every URL-based metadata field — `alternates.canonical`, `openGraph.images` — needs one, resolving against `localhost` and warning at build time without it. The OG cards carry title, description and `siteName` only, which is honest and warning-free. Setting `metadataBase` is the first thing to do when a domain exists.

> **Done, without waiting for the domain.** `lib/site-url.ts` answers the origin question from `SITE_URL`, then `BETTER_AUTH_URL`, then Vercel's production host, and falls back to `http://localhost:3000` — which is what Next infers anyway, the difference being that _stating_ it keeps the build silent. So the warning-free-with-no-environment property above survives, and CI still builds with nothing set.
>
> The origin lives in its own module rather than borrowing `lib/server/base-url.ts`, and the split is not cosmetic. That one answers "where may Better Auth mail a verification link", which is a security question and throws in production rather than guess; this one decides what an OG card's image URL says, which is cosmetic — and a deployment with no accounts at all has no `BETTER_AUTH_URL` to borrow.
>
> `app/opengraph-image.tsx` renders the card at build time, so the route is static like every other. It paints the same picture the verification email does (§13.9) — a contribution grid with squares lit, on the light ground — because those two surfaces are the only places OpenHabits is seen by someone who has not installed it, and they should not look like two different products. No emoji in the markup: `ImageResponse` resolves emoji against a CDN, and a build that reaches the network is a build that can fail offline.
>
> The **favicon** gap closed with it. `app/icon.svg` is what Next turns into `<link rel="icon">`, and `app/favicon.ico` — PNG payloads at 16, 32 and 48 in an ICO container — answers the well-known path for the clients that request it directly and never read the markup. Both come out of `scripts/generate-icons.mjs`, from the same nine-square artwork as the PWA icons; the SVG is described rather than rasterised, because a tab icon is drawn at 16px on one screen and 32 on the next and a vector is simply correct at both.

---

### 8.7 Content-Security-Policy

Until now `next.config.ts` gave a CSP to `/sw.js` and nothing else. The app routes now carry one too, and the interesting part is what it cannot say.

**`script-src` has to keep `'unsafe-inline'`.** Three scripts are inlined into every prerendered document: `lib/theme.ts`'s pre-paint block (§7.1), and two of Next's own flight-data pushes whose contents differ per page and change on every build. Neither escape is available here.

- **A nonce** requires rendering the document per request, and every route is static (§8.1). Worse, `public/sw.js` then caches that HTML — so the nonce would be cached with it and mismatch the header on the next load. The offline app would break itself.
- **Hashes** would have to cover Next's flight scripts, which are per-page and per-build. A static header cannot name them.

That is a real limit and it is worth being plain about: against an injected-script attack, this policy is not the control that saves you. What it does buy is still worth having, and `connect-src 'self'` is the line that matters most — injected script can run, but it cannot post a year of habits to an origin the user has never heard of. `base-uri`, `form-action`, `object-src 'none'` and the ban on external script origins close the rest of the usual escalation paths.

`'unsafe-eval'` is in the policy under `next dev` and only there. React's development build evaluates source text to reconstruct callstacks across the server/client boundary, and a policy without it turns every such attempt into a console error telling you to add it. The production header is unchanged: the directive is appended from `NODE_ENV` in `next.config.ts` rather than written into the constant, so there is no build that ships it.

`style-src` keeps `'unsafe-inline'` for a smaller reason: this app's own seven pages prerender with no `<style>` block and no style attribute, but Next's built-in error and not-found documents ship both, and a strict policy would leave the 404 unstyled. Nothing in the app itself needs it — the palette writes custom properties through CSSOM (`applyPaletteVars`), which CSP does not govern.

---

## 9. File structure

As built:

```
app/
  layout.tsx              root shell, theme script, hydrator, bottom nav
  page.tsx                Today
  manifest.ts             MetadataRoute.Manifest
  apple-icon.png          generated
  week/page.tsx
  week/layout.tsx         route Metadata only — see §8.6
  stats/page.tsx
  stats/layout.tsx        route Metadata only
  habit/page.tsx          Suspense wrapper + Metadata — see the note in §2.2
  quotes/page.tsx
  quotes/layout.tsx       route Metadata only
  settings/page.tsx
  settings/layout.tsx     route Metadata only
  globals.css             tokens, ramps, @theme mapping, safe-area utilities

components/
  AppChrome.tsx           Hydrator + BottomNav
  QuoteCard.tsx           client — see §7.1 for why
  TodayList.tsx
  HabitRow.tsx            the tick target
  HabitForm.tsx           shared by create and edit, plus describeCadence
  Sheet.tsx               bottom sheet over <dialog>, touch only (§6.7)
  HabitFormPanel.tsx      picks the sheet or the inline card (§6.7)
  AddHabit.tsx            thin wrapper over HabitForm
  HabitDetail.tsx         per-habit grid, editing, archive, delete
  Heatmap.tsx             SVG, delegated events, both orientations, legend
  DownloadAppButton.tsx   install prompt, per-browser instructions sheet, InstallCard
  ReminderCard.tsx        the six honest states of a reminder switch (§8.5)

lib/
  types.ts                domain types + DEFAULT_SETTINGS + Synced metadata
  store.ts                in-memory cache + useSyncExternalStore + mutations
  db.ts                   IndexedDB, migrations, requestPersistence
  dates.ts                DayKey maths, week bounds, dayStartHour, civilInZone
  history.ts              cadence evaluation, day rollups, per-habit history
  streaks.ts
  deck.ts                 deck algorithm, seam repair, upcoming schedule
  quotes.ts               the quote corpus, bound to the deck
  facts.ts                the fact corpus, bound to the deck (§5.3)
  daily.ts                the two corpora behind one DailyItem
  colors.ts               ramp lookups, neutral and per-habit
  haptics.ts              tick/completion vibration patterns (§6.4)
  theme.ts                pre-paint script + localStorage mirror
  session.ts              the auth client + the local signed-in hint (§13.6)
  reminders.ts            subscribe/unsubscribe, and why a switch is not offered
  email.ts                nodemailer SMTP transport, built per send (§13.9)
  email-templates/        one pure module per mail: tables, inline styles, no images
    index.ts              the kind → template table every send path reads
    layout.ts             the shell the mails share
  use-swipe.ts            the swipe gesture, and the thresholds it turns on (§6.8)
  use-drag.ts             the week strip's drag, which follows the finger (§6.8)
  today-split.ts          To do above Done, and the hold that keeps rows still (§6.9)
  use-today.ts            the clock as external state
  use-media-query.ts
  *.test.ts               tests over the pure logic

  sync/                   §13 — replication between copies of the local store
    protocol.ts           wire types, the two clocks, LWW + tiebreaker
    merge.ts              pure merge and push selection
    validate.ts           hand-written payload validation for a public endpoint
    client.ts             single-flight runner + useSync triggers

  server/                 the server-side modules; workers/ holds the job handlers
    schema.ts             Drizzle/Postgres tables
    db.ts                 lazily built, globally cached connection
    scope.ts              opens an RLS scope; the only way in to a table (§13.15)
    auth.ts               the identity seam — see §13.6
    auth-types.ts         SyncUser alone, so sync-store imports no auth
    better-auth.ts        what fills the seam: config + lazy instance
    auth-schema.ts        Better Auth's tables, kept apart from `users`
    sync-store.ts         push/pull inside one locked transaction
    push.ts               VAPID + web-push, kept apart so the sweep is testable
    reminders.ts          who is due, in their own timezone, claimed once (§8.5)
    redis.ts              the Upstash handle; lazy, like db.ts (§13.17)
    email-queue.ts        mail handed to QStash instead of awaited (§13.16)
    ratelimit.ts          the tiers, and the one gate here that fails open (§13.17)

app/api/sync/route.ts     replication — the only endpoint touching user data
app/api/auth/[...all]/    sign-up, sign-in, sign-out, session
app/api/reminders/        push subscriptions — a device fact, never replicated
app/api/cron/reminders/   the hourly sweep; fails closed without CRON_SECRET
app/api/email/            the mail queue's entry point; segment config only
proxy.ts                  the global rate limit tier, matched on /api (§13.17)

workers/email.ts          the mail queue's worker; fails closed without its keys
workers/reminders.ts      the hourly Cloudflare cron that calls the sweep (§8.5)
workers/wrangler.jsonc    its schedule; wrangler bundles reminders.ts alone

drizzle/                  generated, reviewed, committed migrations
data/quotes.ts            168 attributed quotes
data/facts.ts             85 sourced fun facts
scripts/generate-icons.mjs
public/sw.js
```

**One form, not two.** `HabitForm` is shared between creating and editing. Two forms over the same fields drift: the edit screen gains a cadence option the add screen never got, and they end up disagreeing about defaults.

**Reordering respects the visible list.** Active and archived habits render as separate lists, so `moveHabit` swaps `order` values within a habit's own group. Stepping over an archived neighbour would look like the button had done nothing.

`lib/dates.ts` is the file most likely to harbour bugs. It is pure, is the **only** place `new Date()` is called with the intent of producing a `DayKey`, and carries the largest share of the test suite: month and year boundaries, leap years, DST transitions in both directions, the `dayStartHour` rollover under fake timers, and — since §8.5 — reading a wall clock in a timezone that is not this machine's.

Two design decisions turned out to be load-bearing and are pinned by tests: the weekly-quota cadence (§12, question 1) and the streak rules (rest days stepped over, the final day forgiven while it is still in progress).

---

## 10. Accessibility & performance

**Accessibility**

- 44×44px minimum touch targets throughout; habit rows are 56px.
- WCAG AA contrast on all text; heatmap levels carry `aria-label`, never color alone.
- Focus rings visible on every interactive element — a 2px ring offset 2px, never `outline: none` without a replacement.
- Full keyboard path: tab to habit row, `Space` to tick; roving tabindex inside the grid.
- `prefers-reduced-motion` honored globally.
- The Stats page states its headline numbers in prose as well as in the grid.

**Performance budgets**

| Metric                                | Budget  | Measured                          |
| ------------------------------------- | ------- | --------------------------------- |
| First-load JS, `/` (gzip)             | < 200KB | **192.3KB**                       |
| — of which framework baseline         | —       | ~152KB (3 shared chunks)          |
| — of which application code           | < 50KB  | ~40KB                             |
| First-load JS, `/quotes` (gzip)       | < 200KB | 189.5KB                           |
| LCP on mid-tier Android, 4G           | < 1.8s  | **2.8s** — over; see below        |
| INP for a habit tick                  | < 50ms  | still unmeasured — needs a device |
| Heatmap pipeline, 371 days × 5 habits | < 8ms   | **2.16ms** ✅                     |
| — same at 20 habits                   | —       | 4.17ms                            |

Measured in the phase-7 audit (§11) with Lighthouse 13.4.1, mobile emulation, simulated Slow 4G and 4× CPU throttling, against `next start`. Scores: **performance 95–96, accessibility 100, best practices 100, SEO 100** across `/`, `/week`, `/stats`, `/settings`, `/quotes`. CLS is 0–0.004 and TBT 40–50ms everywhere — both comfortably good.

The heatmap figure covers the `buildHistory` → `computeStreaks` pipeline, pinned by `tests/history.bench.test.ts`. It scales sub-linearly (4× the habits costs 2.4× the time), so the O(n²) regression the budget exists to catch would be caught. Paint cost is not included and still needs a real device.

> **LCP is over budget for a structural reason, not a fixable one.** The LCP element is the quote `<blockquote>`, and §7.1 forbids rendering it on the server — a static prerender would pin every visitor to the build day's quote. So LCP cannot fire until the JS has loaded and hydrated: unthrottled the breakdown is 7ms TTFB and 144ms element render delay, and the 2.8s figure is that pipeline under Lighthouse's deliberately pessimistic mobile simulation.
>
> Three ways out, and the first is probably right. **(a) Move the budget** — 1.8s was set before anything was measured, and it silently assumed a server-rendered hero the design had already ruled out. **(b) Shrink the critical path** — 152KB of the 192KB is the React + App Router baseline, so this means leaving the App Router, exactly as noted above. **(c) Put text in the placeholder** so something contentful paints sooner. (c) is metric-gaming: it would improve the number without the user seeing their quote any earlier, and it is recorded here to be rejected, not adopted.

**Known measurement gap.** Every Lighthouse run above was against an _empty_ IndexedDB, because the CLI cannot seed it. The heatmap rendered zero cells and no habit row was ever ticked. The benchmark covers the computation at a year of data, but the DOM cost of ~371 SVG cells and the INP of a real tick are both unmeasured, and are the two things a device test exists to find.

> **The 100KB budget in the original draft was wrong**, and worth recording rather than quietly restating. It was set without checking the floor: React 19 plus the Next 16 App Router client runtime is ~152KB gzipped before a line of application code, and 7 of the 8 chunks on `/` are shared across every route. Application code is the part actually under our control, so that is what now carries a budget; the total gets a ceiling that leaves room to notice regressions.
>
> Getting under 100KB total would mean leaving the App Router, not trimming features. That is a real option for an app this client-heavy — worth revisiting only if field LCP disappoints.

The tick budget is still the one that matters. It's met by keeping the mutation synchronous and the persistence fire-and-forget.

---

## 11. Build order

| Phase               | Scope                                                            | Status     |
| ------------------- | ---------------------------------------------------------------- | ---------- |
| **0 — Foundations** | `dates.ts`, `types.ts`, `db.ts`, `store.ts`, tokens              | ✅         |
| **1 — Core loop**   | Today screen, habit CRUD, tick, bottom nav                       | ✅         |
| **2 — Heatmap**     | SVG grid, both layouts, selection panel, legend, streaks         | ✅         |
| **3 — Quotes**      | Corpus, deck algorithm, quote card, favourites                   | ✅         |
| **4 — PWA**         | Manifest, generated icons, service worker, headers, install hint | ✅         |
| **5 — Polish**      | Week screen, export/import, Settings, motion, empty states       | ✅         |
| **6 — Depth**       | Habit detail, quote collection, corpus expansion                 | ✅         |
| **7 — Field**       | Lighthouse, a11y audit, install test on real iOS/Android         | 🟡 partial |

Phase 5's Week screen and Settings came forward because deleting a habit and backing up data are not polish — a tracker you cannot correct or export is not one you would trust with a year.

**Phase 7, done and not done.**

Done in the audit: Lighthouse across all five routes, a systematic contrast audit of every token pairing, the heatmap benchmark in §10, and PWA installability verified (manifest complete with 192/512/maskable icons and shortcuts, `sw.js` serving `install`/`activate`/`fetch` under `no-store` and its own CSP).

Three defects found and fixed:

1. **Contrast.** Every `text-muted/80` and `text-muted/70` in the codebase failed WCAG AA for normal text — 2.64:1 at worst, against a 4.5:1 requirement, in _both_ themes. Lighthouse caught only the one instance that happened to be on the Today page; the other six came out of computing the ratios for all token pairings directly, and all seven are gone. `--muted` at full opacity passes everywhere with little headroom, which is now recorded in `globals.css` so it does not regress.
2. **An unlabelled file input.** The backup importer's `sr-only` `<input type="file">` had no accessible name and was still in the tab order, so a keyboard user landed on an invisible, unnamed control. Named, and taken out of the tab order — the visible button beside it is the real affordance.
3. **A console error on every page load.** The §13 sync client posted to `/api/sync` unconditionally and took a 503, which the browser logs regardless of how the JS handles it. Gated behind `NEXT_PUBLIC_SYNC_ENABLED` so the request path compiles out entirely when sync is off. This also removes what would have been a 401 on every load for every signed-out visitor once auth lands.

Accessibility, best practices and SEO are 100 on every route after those fixes.

**Still not done, and it needs hardware.** No real iOS or Android device has run this. Every measurement above used an empty IndexedDB — the CLI cannot seed it — so the heatmap rendered no cells and no habit was ever ticked. The two budgets that matter most for G1 and G2, INP on a tick and the paint cost of a full grid, remain unmeasured. A dead-simple version of this test is worth more than more tooling: install to a home screen, add five habits, backfill a month, tick something, and watch.

One investigated non-finding, recorded so it is not chased twice: Lighthouse reports 13KB of "legacy JavaScript" (polyfills for `Array.prototype.at`, `Object.hasOwn` and five siblings). They live in Next's own framework chunk, not application code. Raising the tsconfig `target` and adding a modern `browserslist` changed the bundle by 0.5KB — within noise — because `noEmit: true` means TypeScript's `target` never touches the shipped output at all. Both changes were reverted; the browserslist would have narrowed browser support for nothing.

---

## 12. Risks & open questions

| Risk                                               | Mitigation                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage eviction wipes a year of streaks**       | ✅ Done. `lib/db.ts:requestPersistence` calls `persisted()` then `persist()` on the first habit — the moment the user has something to lose |
| **iOS Safari clears data after 7 days of non-use** | Real constraint for infrequent users. Export/import is the v1 answer; account-backed sync is the v2 answer                                  |
| **Quote misattribution**                           | Every entry needs a traceable source before it ships; no unverified quotes                                                                  |
| **Timezone travel**                                | Entries are stamped with local civil dates. Flying across the date line can produce a same-day double-count; accepted as rare and harmless  |
| **The grid looks bleak for new users**             | Pre-`createdAt` days render as neutral rest cells, not failures; the mobile default shows 26 weeks, not 52                                  |

**Resolved during the build**

1. ~~**Should a "weekly, n times" habit fill the grid partially every day, or fully on the days it's done?**~~ **Settled as proposed:** it contributes to `scheduled` only until its weekly quota is met, then becomes a rest day for the rest of the week. Front-loading the week is rewarded, not punished. Pinned by four tests in `lib/history.test.ts`, including the case where the quota interacts with the user's chosen week start.
2. ~~**Counted habits in the heatmap.**~~ **Settled as all-or-nothing:** a counted habit is `done` only at `count >= target`, and contributes to the day's score as one unit either way. Partial credit inside a partial score turned out to be two different fractions stacked on each other, which is more precision than anyone can read off a 11px square. The progress bar on the habit row carries the within-day detail instead.

3. ~~**Habit editing lives in Settings.**~~ **Moved.** Settings lists habits and reorders them; everything else — rename, emoji, colour, cadence, target, archive, delete — lives on the habit's own screen, reachable from both Settings and the Stats breakdown. Delete was removed from Settings rather than duplicated, so there is one destructive path, not two.

**Still open**

2. **Deck size.** 168 verified quotes against a target of ≥400. Every further entry needs checking against a primary source; the bar (§5.2) matters more than the number, so this closes slowly or not at all. At 168 the app promises "once per pass, no repeat within 21 days", which is a true claim and a decent one.
3. **Does the confetti survive contact with real users, or is it the first thing they turn off?** Not built — the tick pop and the streak strip carry the reward for now. Ship it behind a setting, default on, and watch.
4. **Is the forgiven final day too generous?** The current streak does not break until a missed day is a _past_ day. It reads correctly at 9am and slightly flattering at 11pm. An alternative is to forgive only until some hour of the evening.
5. **Archiving takes effect immediately**, so a habit archived after being ticked today leaves an entry that is kept but no longer counted. The alternative — archiving from tomorrow — keeps today's grid intact but makes the button feel unresponsive. Worth revisiting if anyone notices.
6. **Should Today link to a habit's detail screen?** Currently not: the row is the tick target, and a second affordance inside it would put a 44px link inside a 56px button. Detail is reachable from Stats and Settings instead.

---

## 13. Sync

The v2 path §12 promised, built. It answers the two risks v1 could only mitigate: storage eviction (iOS clears data after 7 days of non-use) and the absence of cross-device continuity.

### 13.1 What it does not change

IndexedDB is still the source of truth. Sync is **replication between copies of the local store**, not a move to server-authoritative data, and the shape of §7.1 is untouched: every route still prerenders to static HTML, every mutation still lands in memory synchronously and on disk fire-and-forget, and no screen awaits a network call. With `DATABASE_URL` unset the endpoint answers 503, the client treats sync as off, and the app is the app from v1.

There is exactly one endpoint — `POST /api/sync` — and it is the only dynamic route in the build. No `GET /habits`, no per-record writes, no server rendering of user data.

### 13.2 Two clocks

The one decision everything else follows from.

Every synced record carries `updatedAt`, epoch ms from the device that made the edit. It decides merges: later write wins.

It cannot also be the pull cursor. Device clocks disagree, sometimes by hours. A phone five minutes slow writes an entry stamped 10:00; the laptop has already pulled through 10:03; a cursor built from `updatedAt` steps straight over that entry and loses the day permanently — no error, no retry, no way to notice.

So the server stamps every row with `seq`, from one Postgres sequence. `seq` moves the cursor, `updatedAt` decides conflicts, and the two are never compared. Keeping the jobs in separate fields is the whole trick.

**The sequence is not a usable cursor on its own.** Values are handed out when a statement runs; rows become visible when the transaction commits. Two concurrent syncs can commit in the opposite order to their assignment, and a client pulling through the gap saves the higher seq and steps over the lower one forever. Each sync therefore takes `pg_advisory_xact_lock` on the account, making commit order match assignment order. The contention is one person's two or three devices.

### 13.3 Conflict resolution

Last-write-wins per record, with a tiebreaker that is not optional.

"Incoming wins ties" is broken, quietly: two devices writing the same record in the same millisecond each see the _other_ value as incoming, so each takes the other's. They swap rather than converge, and stay disagreed with no error anywhere. Ties are therefore broken on the record's **content** — both peers compare the same two records with the same rule and reach the same answer. Which value wins is arbitrary; that both pick the same one is the point.

The rule lives once, in `lib/sync/protocol.ts`, and the server uses the same function the client does. It is deliberately _not_ expressed as SQL in the upsert: the tiebreaker would then exist in two languages, and convergence would depend on the two staying exactly in step. Instead the server reads, decides in TypeScript, and writes — safe because of the per-account lock, and bounded because the rows read are bounded by the size of the push.

Granularity is per record, not per field. Two devices editing the same habit's name and colour between syncs will lose one of the two edits. Field-level merging would fix that and is not worth its weight: this is one person's habit tracker, and the losing edit is a rename they can redo.

### 13.4 Deletion needs tombstones

On a replicated store, a missing row and a row the peer has not seen yet are the same observation. A hard delete is therefore re-learned from the server on the next pull, and the habit comes back with its history.

So `Habit` gained `deletedAt`. Deleting writes a tombstone; the habit leaves every screen immediately, but the row survives to tell other devices. Entries carry no tombstone — an entry is never individually deleted ("not done" is `count: 0`, which merges like any other value), and a habit's tombstone already tells every peer to drop that habit's entries. A tombstone per entry would carry no extra information while multiplying synced rows by the length of the user's history.

Two consequences worth stating plainly. **Reset everything** now propagates: on a synced account a local-only wipe would be undone by the next pull, so the button writes tombstones for every habit. And **backups omit tombstones** — a backup is what the user has, not a log of what they discarded.

### 13.5 Resumability

Both directions are capped at 500 records per request. A first sync of a multi-year account does not fit in one response and is not asked to: the server truncates, reports `more: true`, and leaves the cursor short so the next round trip continues. Sync is always resumable and never has to succeed in one shot.

The cursor reported under truncation is the lowest point at which _every_ collection is complete, not the highest seq seen. Habits and entries are capped separately; if habits were cut off at seq 900 while entries ran to 4000, reporting 4000 would step over every habit in between.

The push watermark is the newest stamp **actually sent**, never `Date.now()` — using the clock would skip any edit made while the request was in flight.

_This originally truncated each collection on its own, which reintroduced on the push side the mistake the cursor paragraph above avoids on the pull side._ The watermark is one number across habits, entries and settings, so a push that cut entries off at 500 but carried a newer habit or settings stamp moved the watermark past every entry it had not sent — a first sign-in on a long history uploaded the oldest 500 days and quietly skipped the rest. `collectPush` now picks a single cutoff: just below the first record that does not fit in any collection, which also keeps a run of equal stamps from being split. The one case no single-number watermark can handle is more than 500 records sharing one stamp, which only `restore` of a very long history produces; there the first 500 go and the rest are stepped over, as before.

### 13.6 Identity: the seam, and what fills it

Sync needs one thing from auth: a stable account id to scope rows by. Everything else about signing in is separate work with its own decisions, and the sync layer was built without waiting for it.

`lib/server/auth.ts` defines that contract and nothing more. **It fails closed:** anything other than a valid session returns null and the endpoint answers 401 — no cookie, an expired one, a database that cannot be reached. A permissive default would pool every visitor's habits into one row set, and the first symptom would be a stranger's data on someone's phone.

_This section originally ended here, recording that no provider was wired in and that sync therefore ran for nobody. It now does._ **Better Auth** fills the seam, configured in `lib/server/better-auth.ts` and reached only through `resolveUser`. Email and password, self-hosted on the same Postgres the habits live in: no third-party dependency for an app whose whole argument is that your data is yours, and no outbound mail required to create the first account. Swapping providers still means rewriting one function.

**Its tables are separate from `users`, deliberately.** `auth-schema.ts:user` is the identity — Better Auth owns every column and adds more as plugins are enabled. `schema.ts:users` is the account that sync rows hang off, holding an id and an email because it exists to be the left half of every primary key. Merging them would give a dependency's migrations authority over the table `habits`, `entries` and `settings` all cascade from. The two are linked by `users.id === user.id`, established by the upsert in `sync-store.ts` on first sync — no foreign key, because the upsert already guarantees the row and a cross-owner constraint would fail migrations in whichever order they ran.

**An unverified address is accepted.** Email here is a label on an account whose real key is an opaque id; nothing is sent to it and nothing is authorised by it. Turning on verification is a change to make alongside a mailer, not before one.

#### The client half

Three constraints from §7.1 and §8.2 shape this more than the provider choice does.

**Nothing account-shaped may render on the server.** Every route prerenders and the service worker caches that HTML, so a session read during render would bake one visitor's state into the file served to the next. `AccountCard` is gated on a `useSyncExternalStore` whose server snapshot reports signed-out — the same shape as `display-mode` and `beforeinstallprompt` in §8.4, and for the same reason: the account UI may appear after hydration, never flash and vanish.

**`NEXT_PUBLIC_SYNC_ENABLED` is gone.** It was a build-time placeholder for "should this client sync", and the real answer — is someone signed in — is per device, not per build. `lib/session.ts` keeps a localStorage hint that `lib/sync/client.ts` reads synchronously and offline, so a signed-out browser makes no requests at all and a signed-in one starts syncing without waiting for a round trip to tell it so. The hint carries **no authority**: anyone can set it by hand, and all it grants is permission to make a request the server then answers 401. A stale hint self-corrects, because the 401 path clears it.

**The service worker must not cache `/api/`.** Its stale-while-revalidate rule covered every same-origin GET, which was harmless while `POST /api/sync` was the only endpoint and stopped being harmless the moment `/api/auth/*` existed: a cached session response tells a signed-out browser it is signed in, and keeps saying so offline where nothing can correct it. `public/sw.js` now returns early for the whole API prefix. An offline session check fails, which is the right answer — this app needs the network to prove who you are, never to show you a habit.

The client states which account its data belongs to on every request, and the server refuses a mismatch with 409 before writing anything. Discovering the identity from the _response_ would be too late — a device where someone else has since signed in would already have uploaded the previous person's habits.

**Signing out wipes the device.** It routes through `adoptAccount(null)`, the same path as that 409: local store emptied, cursor reset. The habits are already replicated, and the alternative leaves one person's history readable to whoever picks up the phone next. Because that makes sign-out destructive for anything not yet pushed, it syncs first and asks a second time if that sync failed rather than deciding on the user's behalf.

### 13.7 What is tested

`tests/server/sync-store.test.ts` runs against real Postgres in-process (PGlite, Postgres compiled to WebAssembly), applying the committed migrations verbatim. That matters more here than elsewhere: the delicate parts are all SQL-level — a sequence assigned inside `ON CONFLICT DO UPDATE`, a row-value `IN`, a composite foreign key, an advisory lock — and a test double would check none of them.

Covered: convergence, stale-write rejection, tombstone propagation and cascade, resurrection attempts by a lagging peer, orphan entries, account isolation under colliding client-generated ids, mismatch refusal, idempotent replay, and a 600-entry history pulled across multiple trips with no gaps or repeats.

`tests/sync/merge.test.ts` covers the merge rules as pure functions, including the tie-symmetry case that caught the `>=` bug during the build. `tests/sync/validate.test.ts` covers the endpoint's input validation.

`tests/server/rls.test.ts` covers §13.15, and is the one file here that does not run as PGlite's default role — a superuser, which ignores every policy in the database without saying so. It creates an ordinary role, grants it what the app needs and `SET ROLE`s into it first, because a test of row-level security run as a superuser passes just as happily against a schema that has none.

### 13.8 Open questions

1. **Settings sync as one blob, including `theme`.** A device-local look becomes a global one. Splitting device-local fields from account fields is the fix; the cost is dividing one type in two and threading both through the store. Left until someone complains.
   > **Closed — `theme` left the blob.** Nobody complained; the reason to do it anyway is that it was the one open question guaranteed to be _noticed_, the instant a second device syncs. Appearance is now device-local on all three axes: `theme` in `lib/theme.ts`, `skin` in `lib/skin.ts`, `palette` beside them, all in `localStorage`, all read by the same pre-paint script. `Settings` no longer has the field, so the type did not divide in two — it lost a member, and `lib/store.ts` stopped importing `applyTheme` altogether.
   >
   > Two things had to be right for the removal to be safe. `lib/db.ts:readSettings` now builds the blob field by field rather than spreading a stored one back, so a stale `theme` sitting in an existing device's IndexedDB cannot ride a push into the account. And `parseSettings` **accepts and drops** the field instead of rejecting it: a device still on the older build keeps sending it, and refusing the payload would stop that device syncing its habits over a preference this build does not store.
2. **No conflict is ever shown to the user.** A lost edit is silent by design — surfacing "your rename was overwritten" for a habit tracker seems worse than the loss. Revisit if it turns out to bite.
3. **Tombstones accumulate forever.** Harmless at this scale (one row per deleted habit), but there is no purge. A tombstone older than any plausible offline device could be collected; nothing does it yet.
   > **Closed.** `TOMBSTONE_TTL_MS` in `lib/sync/protocol.ts` — six months, stated once and applied by both halves, like `wins` above it. The client collects on hydrate (`lib/store.ts:collectTombstones`, after the first emit, because a tidy-up has no business in front of the first paint); the server collects inside the sync transaction, where the advisory lock is already held and the work is bounded by one account's habit count.
   >
   > **What the window bounds is resurrection, not storage.** A device offline longer than this returns holding a live copy of a habit whose tombstone everyone has forgotten; nothing contradicts it, so it wins by default and comes back from the dead — without the history, which was purged everywhere else. Six months is chosen against that: a phone in a drawer for half a year is a plausible device, one gone longer is a restored backup.
4. **The advisory lock serialises an account's syncs.** Correct, and fine for a handful of devices. If sync ever runs from many clients at once the lock becomes the bottleneck, and the cursor needs a commit-ordered design instead.
5. **`experimental.useOffline`** (§8.3) is now relevant and unused. The sync client hand-rolls its own online/visibility triggers; `useOffline()` from `next/offline` would give connectivity-aware retry for free.
   > **Closed, and the last sentence was wrong.** The flag is on and the hook is used, but it retries only _framework_ requests — navigations, prefetches, Server Actions. `POST /api/sync` is a plain `fetch` from a Client Component, so sync's retry stays hand-rolled and the visibility trigger and five-minute poll are still there. What was gained is a better answer to "are we offline" than `navigator.onLine`, which reports true for a device on wifi with no route out. See §13.14.
6. **The client polls every five minutes when foregrounded.** Event triggers (visibility, online) carry the real load. If sync ever needs to feel live, this is where a push channel would go.
7. **There is no password reset, and no verification.** Both need a mailer, which the app does not have. Until one exists, a forgotten password means the habits on that device are reachable only through Export backup — which the sign-up form says out loud rather than discovering later.
   > **Both halves are now closed.** Verification became mandatory in §13.10, which is where the first half of this entry stopped being true. Password reset is §13.13, which closes the rest — and with it the sign-up copy that promised there was none.
8. **Signing in merges whatever is already on the device into the account.** A first sync pulls, adopts the account, then pushes local habits up. Right for the common case — someone who used the app signed out and then made an account — and wrong for a borrowed phone, where it silently donates one person's habits to another's account. The 409 path covers a device _changing_ accounts; it does not cover the first one.
   > **Closed by asking.** Signing in on a device that already holds habits and has never been attached to an account now stops on a consent step (`ConfirmMerge` in `components/AccountCard.tsx`) naming the count before anything is uploaded. The session cookie exists by then, but nothing has been pushed: `syncEnabled()` reads the local hint, and withholding the hint is what holds the push.
   >
   > **Both answers are non-destructive, which is the whole design.** "Not mine" does _not_ wipe the device to make room for the account — on the borrowed phone this exists to protect, those habits belong to the person who lent it, and deleting them to resolve the ambiguity is a worse outcome than the one being avoided. It signs out and leaves the device as it was found.
   >
   > A sign-_up_ is exempt: the account it just made is empty and belongs to whoever is holding the device. The remaining uncovered path is the verification link opened on a _different_ device that already has habits — `useSessionSync` sets the hint there without passing through this form. Narrow, and noted rather than fixed.
9. **Two tables that both sound like the user table.** `user` and `users`, one letter apart, owned by different parties for reasons §13.6 argues are good. The reasons do not make the names less confusing to read at 2am. A `schemaName: "auth"` namespace on Better Auth's side would separate them properly, at the cost of a `pgSchema` in the migrations.
   > **Closed.** Better Auth's four tables live in a `pgSchema("auth")`, so the boundary is in the name: `auth.user` is visibly a dependency's table, `public.users` visibly ours.
   >
   > **The migration is hand-written, and had to be.** drizzle-kit cannot tell a table that moved schema from one dropped here and created there — it asks, and the answer it takes without asking is the destructive one, on the tables holding every identity, credential hash and live session. `0005_move_auth_tables_to_auth_schema.sql` is four `ALTER TABLE … SET SCHEMA` statements, which move rows, indexes and constraints and copy nothing. The snapshot in `drizzle/meta/` was edited to match and then _verified by re-running the differ_: `drizzle-kit generate` reports no changes, which is the check that the committed snapshot and the code agree. `tests/server/sync-store.test.ts` asserts the outcome against real Postgres, so a future migration that puts one back in `public` fails there.

---

### 13.9 Outbound mail

A reversal of §13.8 #7 and of the last paragraph of §13.6, both of which assumed
no mailer. There is one now — nodemailer over Gmail SMTP, behind `SMTP_USER`
and `SMTP_PASSWORD` — and a verification mail goes out on sign-up.

**Verifying is still not required to sign in.** The reasoning in §13.6 has not
changed: email is a label on an account whose real key is an opaque id, nothing
is authorised by it, and requiring verification would let a typo'd address lock
someone out of habits that exist on one device and nowhere else.
`requireEmailVerification` stays unset until password reset exists to recover
from exactly that. What the mail buys today is a confirmed address to send a
reset to later, and a signal to the user that the account is real.

**The credentials are optional, like every other variable.** The transport is
built inside the send, from the two variables, and throws a legible error when
they are absent rather than mailing into the void. Building at module scope
would make missing credentials fatal at import for `better-auth.ts`, which is to
say fatal for the whole auth stack, on a project whose first rule (§13.1) is
that it runs with nothing set. A transport per send is cheap next to the SMTP
round-trip it wraps, so there is nothing here to memoise the way
`lib/server/db.ts` memoises its pool.

**The From header is a display name over Gmail's address.** `MAIL_FROM` sets it
and defaults to `OpenHabits <SMTP_USER>`. It cannot be a `noreply@` on some
other domain by wishing: Gmail rewrites From to the authenticated account unless
that address is a verified "Send mail as" alias on it, so an override configured
without doing the Gmail side first changes nothing a recipient sees. The name is
the half that always survives, and the half worth setting.

**A send that fails does not fail the sign-up.** `sendVerificationEmail` awaits
the request — a floating promise inside a serverless invocation may never leave
the machine — and Better Auth's callback then catches and logs. An outage at the
mail provider costs a mail, not an account.

**The template is a separate, pure module.** `lib/email-templates/verification.ts` takes a
URL and returns `{subject, html, text}`; `lib/email.ts` is transport and knows no
markup. That split is what makes the mail testable at all, and the tests pin the
things that are invisible until a real inbox shows them: the URL escaped into
the `href`, the plain-text alternative present, no `<img>` anywhere.

**It is written like a 2003 web page on purpose.** Nested tables, every
declaration inline, hex values copied by hand from `globals.css` because
`var(--accent)` does not survive Gmail. The hero — OpenHabits's contribution grid, one
square lit — is drawn in `<td>` cells rather than an image, so it renders with
remote images blocked, which is the default in Outlook and common in Gmail. A
verification mail whose only branding is a broken-image icon reads as phishing.
Consequence worth knowing: the palette is duplicated, and a change to §6.2 has to
be carried across by hand. There is no way to share it that survives the trip.

**Still missing: a dark variant.** The mail declares `color-scheme: light only`,
which stops Apple Mail and Outlook.com force-inverting a palette that was never
designed for it. Gmail's dark mode tints regardless. A real dark version needs
class hooks in a `<style>` block, which Gmail keeps for `<head>` media queries
even though it strips much else — worth doing, not done.

> **Done.** Both mails now carry a `prefers-color-scheme` block in `<head>`, which is the only place Gmail's web client keeps one. The light values stay _inline_ rather than moving into that block, because the media query is an enhancement and the mail has to be right without it: every client that ignores the block renders exactly what it rendered before. The hooks are classes rather than element selectors, so adding a row to a message cannot silently opt it out of dark mode.
>
> The shell the two mails share came out of the same work — `lib/email-templates/layout.ts`. Two transactional mails that look like two different senders is the smell a phishing filter, and a person, reads as suspicious; they now differ only in the copy and in which square is lit.

---

### 13.10 Verification becomes mandatory

A reversal of §13.9's second paragraph and of §13.6's "an unverified address is
accepted". Both are left standing above because the reasoning in them was sound
for the app as it was; what changed is the trade being made.
`requireEmailVerification` is now on, and no session exists until the link in the
mail is clicked.

**What the old position bought, and why it is no longer worth it.** The argument
against was that a typo'd address would lock someone out of habits that exist on
one device and nowhere else. That is still true and still the cost — but it was
being paid to protect a _sync account_, and the habits are never at risk: they
live in IndexedDB, they are untouched by any of this, and Export backup moves
them. Against that, an unverified address on an account is an address nobody has
proven they own, which makes it useless as the thing a password reset is sent to
and makes "signed in as you@example.com" a claim the app cannot support. Nothing
was authorised by email before; something will be, and an account estate half of
which was never confirmed is not a thing to start a reset flow on top of.

**It follows the mailer, not a flag.** `mailerConfigured()` decides:
SMTP credentials present, verification required; absent, sign-up behaves exactly
as it did in §13.9's world. §13.1 — the app runs with nothing set — outranks this
section, and requiring a click that no mail can deliver would make every
deployment without SMTP credentials a deployment where accounts cannot be
created at all, local development first among them. It is read once per process, which is
the same granularity as `secret` and `baseURL` and no worse.

**A failed send now fails the sign-up**, reversing §13.9's last-but-two
paragraph. Swallowing the error was right when the mail was a courtesy; it is
wrong when the mail is the only way in, because the result is an account that
cannot be verified, cannot be signed in to, and holds the address hostage against
a retry. Better Auth runs sign-up inside a transaction, so throwing rolls the
user row back and the address is free again. With no mailer configured nothing is
required and the error is logged and swallowed as before.

**`autoSignInAfterVerification`.** Clicking the link creates the session. Asking
for the password again on a browser that just proved it holds the mailbox adds a
step and no security. The consequence worth naming: the session lands on
whichever device opened the mail, which is often the phone rather than the laptop
that signed up. The laptop then signs in normally, and §13.8 #8 merges its local
habits at that point — later than before, but the merge is not lost.

**`sendOnSignIn` is the resend path.** An unverified sign-in attempt returns 403
and sends a fresh link on the way out, so the common recovery — the first mail
went to spam — needs no thought from the user. `AccountCard` also offers an
explicit Resend, which hits `/send-verification-email`; that endpoint answers
identically for unknown, already-verified and waiting addresses, and pads its own
timing to match, so it cannot be used to enumerate accounts. There is nothing to
branch on in the UI and nothing to report but "sent".

**The client had to learn one new state.** A sign-up under mandatory verification
returns `token: null` and sets no cookie, so `AccountCard` must _not_ call
`markSignedIn()` — a hint set here would buy nothing but a run of 401s from
`lib/sync/client.ts` for as long as the mail sits unread. Both entry points into
the wait — a sign-up that made no session, and a sign-in refused with
`EMAIL_NOT_VERIFIED` — land in the same panel, which says what has happened to
the habits on this device, because "check your email" on a screen that just
appeared to swallow an account reads as data loss.

**Still no password reset**, so §13.8 #7 is only half closed. A confirmed address
is the prerequisite for one, which is most of what this section is for.

### 13.11 Saying whether it worked

The states above were all built and none of them was ever _announced_. A sign-up
either replaced the form with the verification panel or, on a deployment with no
mailer, silently became the signed-in card — indistinguishable from having
signed in — and a failure was a twelve-pixel line of `--danger` wedged between
the hint paragraph and the buttons. `AccountCard` now reports every outcome
through one `Banner`: `role="alert"` for failures, which should interrupt a
screen reader because they stand between you and what you asked for, and
`role="status"` for confirmations, which should not.

**The outcome is held above the form, not in it.** With no mailer a sign-up comes
back with a live session, Better Auth's `useSession` flips, and the entire
signed-out subtree unmounts on the next tick — so a confirmation stored in that
subtree's state would flash and vanish, which is a more annoying version of the
bug. `AccountCard` owns an `Outcome`, and the signed-in card renders the
"account created" banner (with the count of habits being uploaded into it) until
it is dismissed or the account is signed out of.

**What the sign-up panel is allowed to claim.** Not that an account was created —
that is knowable only where verification is off. With it on, Better Auth answers
a sign-up for an address that already exists with a synthetic success: same
response shape, `token: null`, no row written, so that the form cannot be used to
test whether an address is registered. This is the same non-disclosure the resend
endpoint makes, and the panel's copy has to be true under both readings, which is
why it confirms the _sign-up_ and the mail rather than the account, and names the
duplicate case as a possibility with an action attached. The single case where
the app does know — mailer off, real token, therefore a real new account — is the
one place it says "Account created" outright.

**`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` is thrown only in that same case**, for
the same reason, and the form turns it into "Sign in instead" with the address
kept. The shorter `USER_ALREADY_EXISTS` is matched too; the sign-up route throws
the longer spelling and other paths throw the other.

---

### 13.12 The origin is configured, not inferred

A reversal of §13.6's `baseURL`, which was left unset so Better Auth could work
the origin out per request. It cannot be allowed to: the value it would work out
comes from the `Host` header, and the client sends that.

**What the inferred origin is used for.** Verification links. `sendVerificationEmail`
is handed a URL Better Auth assembles as `${baseURL}/verify-email?token=…`, and
`autoSignInAfterVerification` (§13.10) means possession of that token is a
session. Two things this app already wanted then combine into a chain: mail is
sent from the app's own address with the app's own branding, and
`POST /api/auth/send-verification-email` takes any address, with no session, so
that "resend" needs no second endpoint and cannot be used to enumerate accounts.

So an unauthenticated request with `Host: attacker.example` makes OpenHabits
mail a real, correctly-branded verification link, from its real mail server, to
an address the attacker names — pointing at the attacker's server, with a live
token in the query string. The victim clicks a link they were half expecting;
the attacker replays the token against the real host and is signed in as them.
Nothing in the app is spoofed, which is the part that makes it work.

**Why the front door is not the answer.** A platform that routes by bound domain
drops an unknown `Host` before Next sees it, and on that kind of deployment none
of this is reachable. `next start` behind an nginx `default_server`, or exposed
directly, passes the header straight through — and §13.1 promises the app runs
anywhere Postgres does. A property that holds only on some hosts is not one to
rest an account takeover on.

**`lib/server/base-url.ts` decides, and fails closed.** `BETTER_AUTH_URL` is
pinned when set. Unset, production throws and development infers, where the
only `Host` on offer is the developer's own. (A multi-host allow-list,
`BETTER_AUTH_ALLOWED_HOSTS`, once took precedence for preview deployments; it
was removed, so a preview that needs accounts pins its own `BETTER_AUTH_URL`.)

**It does not cost §13.1.** The check lives inside `build()`, which is lazy and
reached only through `getAuth()` — and every caller of that is already behind
`syncConfigured()`. A deployment with no `DATABASE_URL` never evaluates it, and
one that misconfigures it loses accounts and nothing else: habits are in
IndexedDB, `/api/sync` answers 401 through `resolveUser`'s catch rather than 500,
and the app is the app it was before sync existed. This is the same shape as
`BETTER_AUTH_SECRET`, which Better Auth has always made fatal in production for
the same reason — a value that must be right, refusing to be guessed.

---

### 13.13 Password reset

The last thing §13.8 #7 left open, and the highest-value user-facing gap in the app: an account you cannot get back into is an account whose habits are stranded, and the only recovery the sign-up form could honestly offer was "your habits are still on this device, use Export backup".

The flow is Better Auth's, wired to the mailer §13.9 built. `AccountCard` asks for a link; the mail lands with a token good for **one hour and one use**; `GET /api/auth/reset-password/:token` checks it and redirects to `/reset-password?token=…`; that page sets the new password. No session is created by any of it — whoever opened the mail has proved they hold the address, not that the device they opened it on is one the account should stay signed in on. They sign in afterwards like anyone else.

Four decisions worth stating.

**It says the same thing whether or not the address has an account.** The endpoint is unauthenticated and anyone may type any address into it, so branching the UI on the response would build exactly the account-enumeration oracle the server is careful not to be. `ResetRequested` says "if that address has an account", and the mail itself says "someone asked" and names nobody.

**A failed send is swallowed, which is the opposite of the verification mail.** There, a throw rolls the sign-up transaction back and frees the address to retry (§13.10). Here there is nothing to roll back, and surfacing a send failure would leak whether an address exists — the one thing the paragraph above exists to prevent. It is logged.

**`revokeSessionsOnPasswordReset` is on.** A reset is what someone does when they have lost control of the password, so every existing session is one that might not be theirs. The other devices are signed _out_, not wiped: each discovers it on its next sync, takes the 401, clears the hint, and keeps every habit it holds in IndexedDB. The reset page says so, because "signs out every device" reads like a threat to your data unless you are told it is not.

**With no mailer there is no button.** `sendResetPassword` is only present when `mailerConfigured()`, so Better Auth answers `RESET_PASSWORD_DISABLED` and the card says this deployment cannot reset a password — the same rule §8.5 applies to reminders, and for the same reason: a control that silently does nothing is worse than no control.

`/reset-password` is static like every other route, and reads its token from `?token=` on the client for the reason `/habit` reads its id that way (§2.2). The token is read through `useSyncExternalStore` rather than an effect, with the server snapshot reporting _not read yet_ — the §8.4 rule again. Reporting "bad link" on the server and correcting it after hydration would flash a failure at everyone who arrived with a perfectly good one.

---

### 13.14 Knowing when the network is there

`experimental.useOffline` is on and `lib/sync/client.ts` uses the hook, closing §13.8 #5 — but not in the way that entry predicted, and the difference is worth recording because the entry was cited as free retry.

**Next retries its own requests, not ours.** Navigations, prefetches and Server Actions are held and replayed when connectivity returns. `POST /api/sync` is a plain `fetch` from a Client Component and is explicitly outside that: it stays under the client's own policy, which is the hand-rolled one. The visibility trigger and the five-minute poll are still there and still doing the work.

**What the hook actually replaced is `navigator.onLine`,** which the client used to gate `run()` on, and which answers a question nobody asked: it reports whether a network interface is up. A device on café wifi behind a captive portal, or on a connection whose upstream is dead, reports `true` and every sync fails. The framework polls the origin with a `HEAD` request instead, so the answer means "can reach the server".

The value reaches `run()` through a module-level mirror, because `useOffline` is a hook and `syncNow()` is callable from anywhere. It defaults to _online_, which is the honest answer before anything has mounted, and the worst case is one request that fails and is retried.

---

### 13.15 Row-level security

Every query in `lib/server/` already carries `where user_id = …`. That is where
the isolation _came_ from, and it is one keystroke deep: a filter dropped in a
refactor, a join written against the wrong side, a new query copied from an
older one — none of it fails a test, and all of it reads as somebody else's
habits. So the same rule is now stated a second time, in the one place the
application cannot forget it, and Postgres refuses the query rather than
answering it wrongly.

**Each table has a policy comparing its rows to a transaction-local setting.**
`current_setting('openhabits.user_id')` is written by `lib/server/scope.ts:asUser`
and by nothing else. `sync-store.ts`, the reminder sweep and the subscribe route
all open a scope; nothing reaches a table outside one.

**Unset reads as NULL, and NULL is not true.** `user_id = NULL` is NULL, a
policy that is not true denies the row, so a statement that never said who it
was for reads nothing and writes nothing. Written the other way round — a
sentinel meaning "no restriction" — the same forgetfulness would return
everybody. This is the only property here worth arguing about, and it is the
reason the check is not `coalesce`.

**Transaction-local is not a detail.** `db.ts` pools its connections across a
serverless instance's requests. A session-scoped `SET` left behind on one of
them is not stale state; it is the identity of _whichever request checks it
out next_. (The pool was once a single connection, on the belief that an
instance serves one request at a time. Fluid compute and `next start` both
serve many, and one connection queued every request behind the sync in
flight.) Hence the third argument to `set_config`, and hence scopes being
functions that own a transaction rather than something a caller can set and
forget.

#### FORCE, and the role in DATABASE_URL

**RLS does not apply to a table's owner**, and the role in `DATABASE_URL` is
normally the role that ran the migrations that created these tables. Without
`ALTER TABLE … FORCE ROW LEVEL SECURITY` the whole of `0006` is decorative — no
error, no wrong-looking query, just policies that never fire. drizzle-kit cannot
generate `FORCE`, so those five statements are hand-appended to the generated
migration, and `tests/server/rls.test.ts` asserts `relforcerowsecurity` on every
table rather than trusting that a future regeneration keeps them.

The same hole one level up: **a superuser, or any role with `BYPASSRLS`, ignores
all of it.** Nothing the app can check at runtime distinguishes that from
working correctly, so the migration raises a `WARNING` when the role applying it
is a superuser — the one moment a human is reading the output. Point
`DATABASE_URL` at an ordinary role. Neon's default role is one.

#### The one scope that is not an account

The hourly sweep asks "which devices are due", which is a question about every
device there is, and no per-account scope can answer it. `asServer` opens
`openhabits.scope = 'server'`, and the policies granting anything to it are
deliberately only on `push_subscriptions` (all of it) and `settings` (`select`
only — the sweep needs `reminderHour`, `dayStartHour` and `weekStartsOn` to
decide who is due).

**`habits`, `entries` and `users` have no bypass at all.** There is no scope in
this codebase, and no setting a caller could name, under which habit content is
readable without saying whose it is — which is why the sweep drops back into
`asUser` for each due account before it reads a single habit, and why the
reminder it composes is assembled inside that account's scope.

The second `asServer` caller is the subscribe upsert, and it is the one place
the design bends. `push_subscriptions` is keyed on endpoint alone (§8.5), so a
device that changes hands is a row overwritten across accounts — and
`on conflict do update` against a row the policy hides is an _error_, not a
no-op. Postgres cannot express "you may take over a row you may not read", so
the takeover says out loud that it is not acting for one account. The `user_id`
it writes is the session's; the caller supplies an endpoint and nothing else.

#### What it does not cover

**Better Auth's four tables are outside this**, in the `auth` schema, and stay
there. Every query against them happens _before_ there is an account to scope
to: a sign-in looks a user up by email, a session lookup by token. A policy over
that is a policy every statement would need a bypass for, which is a policy that
does nothing but suggest otherwise.

And it does not replace the `where` clauses. Both halves are load-bearing: the
clauses are what makes the queries correct and fast — the policy is not a
substitute for an index — and the policy is what makes them safe on the day one
of the clauses is wrong. The redundancy is the design, not something to tidy up.

### 13.16 Outbound mail leaves the request

A partial reversal of §13.10, and the narrowing is the whole content of this section.

§13.10 made a failed send fail the sign-up: Better Auth runs sign-up in a transaction, so throwing out of `sendVerificationEmail` rolls the row back and frees the address to try again. That was the right rule when the send _was_ the sign-up's last step. It came with two costs that were easy to miss while the happy path worked. A sign-up waits on Gmail — `lib/email.ts` builds a fresh transport per send and, until now, set no timeouts at all, so a stalled relay stalled the handler until the platform killed it. And a transient hiccup is indistinguishable from a permanent one: the address is freed, which is correct, but the only retry available is a human doing the whole sign-up again.

**What changed.** `lib/server/email-queue.ts` hands the mail to QStash and returns. `better-auth.ts:deliver` picks the branch, and which branch runs is a property of the deployment rather than of the caller — with no `QSTASH_TOKEN` the send is inline and awaited, exactly as before, and every one of these variables is optional in the sense `.env.example` means it.

**The rule survives, one step earlier.** What the sign-up awaits is still real, and a failure still throws and still rolls back — but the thing that succeeded is the _hand-off_, not the send. That keeps the case worth keeping: a deployment that cannot accept the job at all — no store, no token, Upstash down — refuses the sign-up and frees the address, which is what §13.10 was protecting. What it gives up is the case where the hand-off succeeds and the send does not. QStash retries that three times and then parks it in the dead letter queue, and the account exists throughout.

**That is a real loss and it should be written down as one.** After §13.10 there was no state in which an account existed with no verification mail sent; now there is. The person holding it sees a sign-up that worked and a mail that never came, and can ask for a resend — `sendOnSignIn` covers them — but **nothing alerts anybody** that the DLQ has something in it. This is the same shape as §8.5's warning about the Worker: someone still has to go and look. The trade was taken because the alternative failure — a sign-up that dies on a slow relay, with no retry — is both more likely and less visible than a queue somebody eventually reads.

**The link does not travel in the message.** A verification URL is a session (§13.12), and a QStash message body is retained so the console and the DLQ can show it. So the envelope goes into Redis under a random id with an hour's TTL — matching `resetPasswordTokenExpiresIn`, since an envelope outliving its own token is a job whose only outcome is a dead link — and the message carries the id alone. The token is then readable by whoever holds the Redis credentials and nobody else, and it expires on its own whether or not the worker ever runs.

`lib/server/base-url.ts:mailableOrigin` is checked on the way back out, and it is not paranoia about our own writes. §13.12 is entirely about this app being made to mail a genuine, correctly-branded link into an origin it does not own, and the envelope store is a second place that could be made to say so — a place the request no longer holds. Nothing in the threat model lets an attacker choose that value; the id travels only in a signed message. But the check costs one comparison and turns a compromise of the store into a refused send rather than a phishing relay, so it is there, and it lives in `base-url.ts` because that is the module that owns the question.

**The envelope is read, not claimed, and that is the opposite of §8.5.** The reminder sweep claims a device with the same `UPDATE` that selects it, so an at-least-once cron sends at most once. Here the retry is the entire reason the queue exists, and a consumed envelope makes a failed send unretryable — so `dequeueEmail` reads, the send happens, and `completeEmail` deletes only afterwards. The cost is that a send whose 200 is lost produces a second mail. For a verification or reset link that is a duplicate in an inbox rather than a wrong outcome, and the alternative is a link that never arrives. A missing envelope on a later retry is therefore answered **200**, not an error: it means the mail already went, or the hour ran out and the token in it had expired too. Answering non-2xx would retry both to exhaustion.

**`/api/email` is the fifth endpoint**, and the second whose caller is a machine. Its shape is the one `/api/cron/reminders` established: no signing keys means it refuses every request rather than trusting whoever asks, because it mails a link to an address its own body names. What differs is what a failure means — QStash retries a non-2xx, so a 500 there is a request to try again rather than an incident.

**Nodemailer now has timeouts.** Independent of the queue and worth having either way: ten seconds to connect and greet, twenty on the socket. On the inline path that is the difference between a slow sign-up and a hung one; on the queued path a hang is strictly worse than a failure, because a failure is retried and a hang burns the invocation.

**QStash cannot reach a laptop.** It delivers by making an HTTP request from its own network, so `queueConfigured()` answers false for a localhost origin whatever the token says, and mail is sent inline in development. Without that clause a developer holding a real token would fill the DLQ with undeliverable messages while no mail arrived — worse than not queueing, and silently so.

### 13.17 Metering the endpoints

Nothing was rate limited, and one endpoint made that worse than it sounds.

`POST /api/auth/send-verification-email` takes any address with no session at all. That is deliberate and §13.12 explains why — "resend" then needs no second endpoint and cannot be used to enumerate accounts — and `request-password-reset` answers the same way for an address it has never seen, for the reason §13.13 gives. Both properties are worth keeping. Together and unmetered they are an outbound-mail primitive with somebody else's inbox on the far end, and the resource it spends first is not compute but one Gmail account's daily quota. `/api/sync` is the other expensive one: a 2 MB body, an account-wide advisory lock and a full-history pull, all reachable in a loop.

**One generous tier in front of everything, and tight tiers where the cost is.** The global tier lives in `proxy.ts` — Next 16's rename of `middleware.ts`; it runs on the Node runtime and a `runtime` export there throws rather than being ignored. 300 requests a minute per IP, chosen so that nobody using the app ever meets it, which is what makes it safe to put in front of every endpoint at once.

The matcher is `/api/:path*` and that is the point of it. Every route in this app but five prerenders to static HTML a CDN serves; a proxy with no matcher would put a function invocation in front of all of it and a Redis command in front of every stylesheet. Scoped to `/api`, it runs only where there was already going to be a function.

| Tier                    | Key                | Budget            | What it bounds                      |
| ----------------------- | ------------------ | ----------------- | ----------------------------------- |
| Global, all `/api`      | IP                 | 300 / min         | Everything, generously              |
| Mail-sending auth paths | IP **and** address | 3 / min, 10 / day | An SMTP quota, and somebody's inbox |
| Credential paths        | IP                 | 10 / min          | Password-hash verifies; brute force |
| `POST /api/sync`        | account            | 60 / min          | The advisory lock and a full pull   |
| `POST /api/reminders`   | account            | 30 / min          | The subscription upsert             |

**The mail tier is keyed twice, and the second key is the one that matters.** Three a minute per IP is trivially defeated by rotating them. What is worth preventing is not load but one address being mailed over and over, so the budget that follows the _address_ is a day long. Reading it means cloning the request body; the original still reaches Better Auth unread, and a body that does not parse is Better Auth's to answer for rather than the limiter's.

**Two endpoints are excluded, and the exclusion is stated once.** `/api/email` and `/api/cron/reminders` both authenticate their caller by signature or shared secret, both are called by a machine on a schedule the app does not control, and a limiter in front of either can only ever refuse a legitimate request. That could have been a negative lookahead in the matcher; it is `ratelimit.ts:metered` instead, because two expressions of one rule have to agree and only one of them can be unit-tested. The cost is a proxy invocation that returns immediately without touching Redis.

**`lib/server/ratelimit.ts` fails open, and it is the only gate on this server that does.** Everything else here refuses when it cannot answer: the cron route with no secret, `resolveUser` on a thrown session lookup, an RLS policy that is not true (§13.15). A limiter is the opposite case. Its store being unreachable is not evidence of abuse, and turning a Redis outage into a site-wide 429 would hand an attacker the outage as a denial of service — so a timeout or an error is a request allowed, and the timeout is 1.5 seconds so the failure costs latency rather than a hung handler. A request with no attributable IP is allowed for the same reason; the alternative is one limiter key shared by everyone the platform failed to label.

**429 is not 401, and the client has to keep them apart.** `lib/sync/client.ts` handles the two very differently and deliberately: the 401 path clears the signed-in hint, which is what makes `syncEnabled()` trustworthy, and doing that on a 429 would sign a device out for being busy. Nor is it the `retry` path, which goes round the loop immediately — the one thing a rate limit is asking us not to do. So a 429 stops that run with a message saying so, and `useSync` calls back on the next change, focus or reconnect, by which time the window has moved. `rate-limited` is a `SyncErrorCode` for this reason: it is the only code in that union about the request's _rate_ rather than its content, and so the only one worth trying again unchanged.

**Analytics are on.** The limiters report to the Upstash dashboard, which is the only place a refusal is visible — the alternative is discovering the tiers are wrong from a user who cannot sign in.
