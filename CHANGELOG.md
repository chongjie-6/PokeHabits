# Changelog

All notable changes to OpenHabits are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Self-hosting

- `docker compose up` runs the app with its own Postgres and migrations, as an
  ordinary database role so row-level security holds. Reminders are an opt-in
  profile.
- A Deploy to Vercel button in the README.

## [1.0.0] — 2026-09-14

The first release. Everything below works with no account and no network.

### Habits

- Tick a habit on **Today** and it is saved locally before the tap finishes —
  no spinner, no server round trip.
- Today is split into **To do** above a collapsible **Done**, and swipes between
  days. An edit mode lets you change habits without leaving the screen.
- **Week** shows seven days × every habit, so you can backfill yesterday or fix
  last Thursday, and swipes between weeks.
- Habits take any colour, a cadence, rest days, archive and delete — with a
  one-tap **undo** after a delete.
- Optional haptic buzz on a tick.

### Stats

- A full year drawn as a **contribution grid**, where rest days look different
  from missed ones.
- Streaks, perfect days, completion rates, and weekday and monthly trends — with
  no best or worst weekday named on too little data.
- **Share card**: the year as a single image, drawn in the browser from your own
  data.

### Daily card

- 168 sourced quotes and 85 sourced fun facts, dealt from a shuffled deck:
  every entry once per pass, nothing repeated within 21 days, and the same card
  on every device.
- Save favourites, filter the deck by tag, and see when a saved entry next comes
  round in the **Collection**.

### Appearance

- Three skins — `classic`, `grid` and `blocks` — each in light and dark.
- Build a full palette from a single colour, checked against WCAG AA.
- Appearance is per device and never syncs.

### Offline and install

- Installable PWA; every route is precached and works offline.
- Export and import everything as JSON, with the backup checked record by
  record before it replaces anything.

### Accounts, sync and reminders (optional)

- Email and password accounts via Better Auth, with email verification and
  password reset.
- Sync between devices on Postgres: last write wins per record and ties break on
  content, so devices converge.
- Signing in on a device that already has habits asks before uploading them.
- Row-level security on every table.
- Daily push reminders at the hour you choose, in your own timezone.
- Outbound mail queued through QStash, and the API rate-limited.

[Unreleased]: https://github.com/chongjie-6/OpenHabits/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/chongjie-6/OpenHabits/releases/tag/v1.0.0
