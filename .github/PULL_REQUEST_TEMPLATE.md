## What this changes

<!-- One or two sentences. What is different after this merges? -->

Fixes #

## Why

<!-- The problem, not the patch. If this contradicts something in DESIGN.md,
     say so here and update DESIGN.md in this same pull request. -->

## How it was tested

<!-- Which tests you added, and anything you checked by hand in the running app
     — which skin, which theme, which screen. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass locally
- [ ] `npm run build` was run with **no environment set** (every variable in `.env.example` is optional)
- [ ] New logic in `lib/` has tests under `tests/`, mirroring the module path
- [ ] Schema changes ship a committed migration, and `npm run db:generate` reports no changes
- [ ] `DESIGN.md` / `ROADMAP.md` updated if this changes a decision recorded there
- [ ] No user- or date-dependent rendering was added to the server
- [ ] Appearance changes (theme, skin, palette) stayed device-local

## Screenshots

<!-- For anything visual: light and dark, and the affected skin. Delete if not applicable. -->
