/**
 * The daily card's corpus and the tag filter over it. What is new beyond the
 * per-corpus tests is the seam `Settings.dailyTags` opens: one flat list over
 * two vocabularies, where the failure that matters is an empty card.
 */

import { describe, expect, it } from "vitest";
import { FACTS } from "@/data/facts";
import { QUOTES } from "@/data/quotes";
import {
  activeTagsFor,
  corpusFor,
  countFor,
  dailyForDay,
  deckCountFor,
  repeatGapFor,
  scheduleFor,
  tagsFor,
} from "@/lib/daily";
import type { DayKey } from "@/lib/types";

const DAY: DayKey = "2026-08-14";

describe("the two tag unions", () => {
  it("share no tag, which is what lets one flat list serve both", () => {
    const quotes = new Set(tagsFor("quotes"));
    // If these ever overlap, selecting a quote tag silently narrows the facts
    // too, and `activeTagsFor` stops meaning what it says.
    expect(tagsFor("facts").some((tag) => quotes.has(tag))).toBe(false);
  });
});

describe("activeTagsFor", () => {
  it("keeps only the tags the mode's own corpus knows", () => {
    const mixed = ["discipline", "space", "ocean"];
    expect(activeTagsFor("quotes", mixed)).toEqual(["discipline"]);
    expect(activeTagsFor("facts", mixed)).toEqual(["space", "ocean"]);
  });

  it("reports them in the union's fixed order, not the user's tap order", () => {
    const reversed = [...tagsFor("quotes")].reverse();
    expect(activeTagsFor("quotes", reversed)).toEqual(tagsFor("quotes"));
  });

  it("is empty for a selection this corpus has none of", () => {
    expect(activeTagsFor("quotes", ["space", "food"])).toEqual([]);
  });
});

describe("deckCountFor", () => {
  it("is the whole corpus with no filter", () => {
    expect(deckCountFor("quotes", [])).toBe(QUOTES.length);
    expect(deckCountFor("facts", [])).toBe(FACTS.length);
  });

  it("narrows to the tagged subset", () => {
    const tagged = QUOTES.filter((q) => q.tags.includes("discipline")).length;
    expect(tagged).toBeGreaterThan(0);
    expect(deckCountFor("quotes", ["discipline"])).toBe(tagged);
  });

  it("unions the tags rather than intersecting them", () => {
    const either = QUOTES.filter(
      (q) => q.tags.includes("discipline") || q.tags.includes("courage"),
    ).length;
    expect(deckCountFor("quotes", ["discipline", "courage"])).toBe(either);
  });

  it("falls back to the whole corpus when the filter names nothing it has", () => {
    // The stored list is flat across both corpora, so this is the ordinary case
    // of someone who has only ever picked fact tags looking at a quote.
    expect(deckCountFor("quotes", ["space", "ocean"])).toBe(QUOTES.length);
  });

  it("ignores a tag no build of the app has ever had", () => {
    // A device on a newer release pushes a tag this one does not know; the
    // settings blob is accepted whole, so this must narrow nothing.
    expect(deckCountFor("quotes", ["something-new"])).toBe(QUOTES.length);
  });

  it("never exceeds the corpus it draws from", () => {
    expect(deckCountFor("quotes", tagsFor("quotes"))).toBeLessThanOrEqual(
      countFor("quotes"),
    );
  });
});

describe("dailyForDay, filtered", () => {
  it("only ever lands on something carrying one of the chosen tags", () => {
    const item = dailyForDay(DAY, "quotes", ["discipline"]);
    expect(item.tags).toContain("discipline");
  });

  it("stays inside the filter across a full pass of the narrowed deck", () => {
    const size = deckCountFor("quotes", ["courage"]);
    for (let i = 0; i < size + 5; i++) {
      const day = `2026-08-${String((i % 28) + 1).padStart(2, "0")}`;
      expect(dailyForDay(day, "quotes", ["courage"]).tags).toContain("courage");
    }
  });

  it("gives the unfiltered answer when the filter names another corpus", () => {
    expect(dailyForDay(DAY, "quotes", ["space"]).id).toBe(
      dailyForDay(DAY, "quotes", []).id,
    );
  });

  it("is still a pure function of the date", () => {
    // G3's whole promise: the same day and the same settings give the same item
    // on every device, with no state anywhere.
    expect(dailyForDay(DAY, "facts", ["ocean"]).id).toBe(
      dailyForDay(DAY, "facts", ["ocean"]).id,
    );
  });
});

describe("scheduleFor, filtered", () => {
  it("dates only the items the filter admits", () => {
    const schedule = scheduleFor(DAY, "quotes", ["discipline"]);
    const corpus = corpusFor("quotes");

    expect(schedule.size).toBe(deckCountFor("quotes", ["discipline"]));
    for (const item of corpus) {
      // Anything outside the deck has no next appearance to report.
      const inDeck = item.tags.includes("discipline");
      expect(schedule.has(item.id)).toBe(inDeck);
    }
  });

  it("reaches every item in the narrowed deck", () => {
    const schedule = scheduleFor(DAY, "facts", ["space", "ocean"]);
    expect(schedule.size).toBe(deckCountFor("facts", ["space", "ocean"]));
  });
});

describe("repeatGapFor", () => {
  it("shrinks with the deck, rather than repeating the corpus figure", () => {
    const whole = repeatGapFor("quotes", []);
    const narrowed = repeatGapFor("quotes", ["discipline"]);

    // The settings screen prints this number as a promise. A filtered deck
    // repeats sooner, and saying otherwise would be the one dishonest line.
    expect(narrowed).toBeLessThan(whole);
    expect(narrowed).toBeGreaterThanOrEqual(1);
  });
});
