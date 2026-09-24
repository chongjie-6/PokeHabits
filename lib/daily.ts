/**
 * The daily card's corpus, whichever is selected. See DESIGN.md §5.3. The one
 * module that knows both: everything downstream reads a `DailyItem` and never
 * learns which corpus produced it, so no skin grows a second variant. The two
 * decks run independently, so switching modes lands you mid-sequence.
 */

import { FACTS } from "@/data/facts";
import { QUOTES } from "@/data/quotes";
import { itemForDay, seamWindow, upcomingSchedule } from "./deck";
import { deckFor as factDeckFor, FACT_TAGS } from "./facts";
import { deckFor as quoteDeckFor, QUOTE_TAGS } from "./quotes";
import type { DailyMode, DayKey, Fact, Quote } from "./types";

/**
 * A quote or a fact, flattened for display. `byline` is always there — an
 * author, or a fact's source, which is all the attribution a fact has — and
 * `detail` is the second line only a quote with a source has.
 */
export type DailyItem = {
  id: string;
  text: string;
  byline: string;
  detail?: string;
  note?: string;
  tags: string[];
};

function fromQuote(quote: Quote): DailyItem {
  return {
    id: quote.id,
    text: quote.text,
    byline: quote.author,
    detail: quote.source,
    note: quote.note,
    tags: quote.tags,
  };
}

function fromFact(fact: Fact): DailyItem {
  return {
    id: fact.id,
    text: fact.text,
    byline: fact.source,
    note: fact.note,
    tags: fact.tags,
  };
}

/** The whole corpus for a mode, in corpus order rather than deck order. */
export function corpusFor(mode: DailyMode): DailyItem[] {
  return mode === "facts" ? FACTS.map(fromFact) : QUOTES.map(fromQuote);
}

/**
 * What a mode draws from once `dailyTags` is applied, as against `corpusFor`,
 * which is everything there is to browse. Every function answering a question
 * about the *sequence* takes the same tags, or the collection's schedule
 * describes a deck the card is not using.
 */
function deckFor(
  mode: DailyMode,
  tags: readonly string[] = [],
): Quote[] | Fact[] {
  return mode === "facts" ? factDeckFor(tags) : quoteDeckFor(tags);
}

export function dailyForDay(
  day: DayKey,
  mode: DailyMode,
  tags: readonly string[] = [],
): DailyItem {
  return mode === "facts"
    ? fromFact(itemForDay(day, factDeckFor(tags)))
    : fromQuote(itemForDay(day, quoteDeckFor(tags)));
}

/**
 * Filtered-out items are absent rather than dated, which is what lets the
 * collection sort them last and promise nothing about a day.
 */
export function scheduleFor(
  from: DayKey,
  mode: DailyMode,
  tags: readonly string[] = [],
): Map<string, DayKey> {
  return mode === "facts"
    ? upcomingSchedule(from, factDeckFor(tags))
    : upcomingSchedule(from, quoteDeckFor(tags));
}

/** Here so a new mode cannot be added without someone writing its nouns down. */
export const MODE_COPY: Record<
  DailyMode,
  { one: string; many: string; label: string }
> = {
  quotes: {
    one: "quote",
    many: "quotes",
    label: "Quotes",
  },
  facts: {
    one: "fact",
    many: "facts",
    label: "Fun facts",
  },
};

/** The mode's tag union, as the filter row needs it: strings, in a fixed order. */
export const tagsFor = (mode: DailyMode): string[] =>
  mode === "facts" ? FACT_TAGS : QUOTE_TAGS;

/** Everything in the corpus, filter or no filter — what there is to browse. */
export const countFor = (mode: DailyMode): number =>
  mode === "facts" ? FACTS.length : QUOTES.length;

/** How many of those the card can currently land on. */
export const deckCountFor = (
  mode: DailyMode,
  tags: readonly string[] = [],
): number => deckFor(mode, tags).length;

/**
 * The guaranteed gap between two showings, read off the *filtered* deck —
 * narrow the tags and the gap shrinks with them, which the settings screen says
 * rather than repeating a number from the full corpus.
 */
export const repeatGapFor = (
  mode: DailyMode,
  tags: readonly string[] = [],
): number => seamWindow(deckCountFor(mode, tags));

/** Which of a mode's own tags a flat cross-corpus selection actually names. */
export const activeTagsFor = (
  mode: DailyMode,
  tags: readonly string[],
): string[] => {
  const wanted = new Set<string>(tags);
  return tagsFor(mode).filter((tag) => wanted.has(tag));
};
