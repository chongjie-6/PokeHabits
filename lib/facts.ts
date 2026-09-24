/**
 * The fact corpus, bound to the deck (§5.3). Shaped exactly like
 * `lib/quotes.ts`; the two differ only in contents and tag union.
 */

import { FACTS } from "@/data/facts";
import { itemForDay, seamWindow } from "./deck";
import type { DayKey, Fact, FactTag } from "./types";

/**
 * An empty selection means "everything", and so does one this corpus has none
 * of. `readonly string[]` rather than the union, because the caller is a synced
 * blob an older build wrote; membership is decided here, by intersection.
 */
export function deckFor(tags: readonly string[] = []): Fact[] {
  if (tags.length === 0) return FACTS;
  const wanted = new Set<string>(tags);
  const filtered = FACTS.filter((f) => f.tags.some((t) => wanted.has(t)));
  return filtered.length > 0 ? filtered : FACTS;
}

/** The fact for a given day. */
export function factForDay(day: DayKey, deck: Fact[] = FACTS): Fact {
  return itemForDay(day, deck);
}

export const FACT_TAGS: FactTag[] = [
  "space",
  "earth",
  "ocean",
  "animals",
  "body",
  "language",
  "history",
  "numbers",
  "technology",
  "food",
];

export const FACT_COUNT = FACTS.length;

/** The guaranteed minimum number of days between two showings of a fact. */
export const MIN_REPEAT_GAP = seamWindow(FACTS.length);
