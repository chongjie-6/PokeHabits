/**
 * The quote corpus, bound to the deck. See DESIGN.md §5.1, §5.2.
 *
 * The selection algorithm itself lives in `lib/deck.ts`, which knows only that
 * items have ids — quotes and facts are two corpora running the same deck.
 */

import { QUOTES } from "@/data/quotes";
import { itemForDay, seamWindow } from "./deck";
import type { DayKey, Quote, QuoteTag } from "./types";

/**
 * An empty selection means "everything", and so does one this corpus has none
 * of. `readonly string[]` rather than the union, because the caller is a synced
 * blob an older build wrote; membership is decided here, by intersection.
 */
export function deckFor(tags: readonly string[] = []): Quote[] {
  if (tags.length === 0) return QUOTES;
  const wanted = new Set<string>(tags);
  const filtered = QUOTES.filter((q) => q.tags.some((t) => wanted.has(t)));
  return filtered.length > 0 ? filtered : QUOTES;
}

/** The quote for a given day. */
export function quoteForDay(day: DayKey, deck: Quote[] = QUOTES): Quote {
  return itemForDay(day, deck);
}

export const QUOTE_TAGS: QuoteTag[] = [
  "discipline",
  "resilience",
  "craft",
  "time",
  "beginning",
  "doubt",
  "simplicity",
  "courage",
  "growth",
];

export const QUOTE_COUNT = QUOTES.length;

/** The guaranteed minimum number of days between two showings of a quote. */
export const MIN_REPEAT_GAP = seamWindow(QUOTES.length);
