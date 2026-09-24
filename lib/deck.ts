/**
 * Deterministic daily selection. See DESIGN.md §5.1. `hash(date) % N` repeats
 * within weeks by the birthday problem, so the corpus is a deck reshuffled once
 * per pass — a pure function of the date, so nothing is persisted and the
 * archive view is free. Generic over the corpus, there being two (§5.3).
 */

import { addDays, daysBetween } from "./dates";
import type { DayKey } from "./types";

/** All the deck needs to know about an item. */
export type DeckItem = { id: string };

/** Day zero for the deck sequence. Changing this reshuffles everyone's stream. */
const EPOCH: DayKey = "2026-01-01";

/** Small, fast, deterministic 32-bit PRNG. Identical across JS engines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, driven by the supplied PRNG. Does not mutate the input. */
function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Spread consecutive cycle numbers across the seed space. */
function seedForCycle(cycle: number): number {
  let h = 0x811c9dc5 ^ cycle;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** How many days at each end of a cycle are protected from repeating. */
export const seamWindow = (size: number) => Math.max(1, Math.floor(size / 8));

/**
 * A per-cycle shuffle says nothing about the *join* between passes, so anything
 * shown in the closing `k` days of the last cycle is pushed out of this one's
 * opening `k`. Swap targets avoid the final `k` slots, which is what lets the
 * previous tail be read off its raw shuffle rather than recursing.
 */
function deckForCycle<T extends DeckItem>(
  deck: readonly T[],
  cycle: number,
): T[] {
  const shuffled = shuffle(deck, mulberry32(seedForCycle(cycle)));
  const size = shuffled.length;
  const k = seamWindow(size);

  // Too small to protect a seam without the windows overlapping.
  if (size <= 3 * k) return shuffled;

  const previous = shuffle(deck, mulberry32(seedForCycle(cycle - 1)));
  const recent = new Set(previous.slice(size - k).map((item) => item.id));

  for (let i = 0; i < k; i++) {
    if (!recent.has(shuffled[i].id)) continue;
    for (let j = k; j < size - k; j++) {
      if (recent.has(shuffled[j].id)) continue;
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      break;
    }
  }

  return shuffled;
}

/** Once per pass, and never twice inside a `seamWindow(size)` window. */
export function itemForDay<T extends DeckItem>(
  day: DayKey,
  deck: readonly T[],
): T {
  const size = deck.length;
  if (size === 0) throw new Error("deck is empty");

  const index = daysBetween(EPOCH, day);
  // Floor division and a non-negative modulo, so days before EPOCH work too.
  const cycle = Math.floor(index / size);
  const position = ((index % size) + size) % size;

  return deckForCycle(deck, cycle)[position];
}

/**
 * `id → DayKey` of each item's next appearance. Scans **two** cycles: `from` is
 * mid-cycle, so one window is a tail plus a head that overlap arbitrarily,
 * where two must contain a whole aligned cycle and therefore every item.
 */
export function upcomingSchedule<T extends DeckItem>(
  from: DayKey,
  deck: readonly T[],
): Map<string, DayKey> {
  const out = new Map<string, DayKey>();
  for (let i = 0; i < deck.length * 2; i++) {
    const day = addDays(from, i);
    const item = itemForDay(day, deck);
    if (!out.has(item.id)) out.set(item.id, day);
  }
  return out;
}
