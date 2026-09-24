import { describe, expect, it } from "vitest";
import { QUOTES } from "@/data/quotes";
import { addDays } from "@/lib/dates";
import { upcomingSchedule } from "@/lib/deck";
import { deckFor, quoteForDay, QUOTE_COUNT } from "@/lib/quotes";

describe("the deck", () => {
  it("is deterministic — the same day always yields the same quote", () => {
    expect(quoteForDay("2026-08-14").id).toBe(quoteForDay("2026-08-14").id);
  });

  it("never repeats within a full pass of the deck", () => {
    const seen = new Set<string>();
    let day = "2026-01-01";
    for (let i = 0; i < QUOTE_COUNT; i++) {
      seen.add(quoteForDay(day).id);
      day = addDays(day, 1);
    }
    expect(seen.size).toBe(QUOTE_COUNT);
  });

  it("reshuffles into a different order on the next pass", () => {
    const first: string[] = [];
    const second: string[] = [];
    let day = "2026-01-01";

    for (let i = 0; i < QUOTE_COUNT; i++) {
      first.push(quoteForDay(day).id);
      day = addDays(day, 1);
    }
    for (let i = 0; i < QUOTE_COUNT; i++) {
      second.push(quoteForDay(day).id);
      day = addDays(day, 1);
    }

    expect(new Set(second).size).toBe(QUOTE_COUNT);
    expect(second).not.toEqual(first);
  });

  it("never repeats a quote across the seam between cycles", () => {
    // A per-cycle shuffle alone does not give this: the last quote of one pass
    // could open the next. Scan across a cycle boundary and check the gap.
    const window = Math.max(1, Math.floor(QUOTE_COUNT / 8));
    const lastSeen = new Map<string, number>();
    let day = "2026-01-01";

    for (let i = 0; i < QUOTE_COUNT * 3; i++) {
      const { id } = quoteForDay(day);
      const previous = lastSeen.get(id);
      if (previous !== undefined) {
        expect(
          i - previous,
          `${id} repeated after ${i - previous} days`,
        ).toBeGreaterThan(window);
      }
      lastSeen.set(id, i);
      day = addDays(day, 1);
    }
  });

  it("works for days before the epoch", () => {
    // Floor division plus a non-negative modulo, so time travel backwards is
    // well defined rather than producing a negative index.
    const quote = quoteForDay("2025-06-15");
    expect(quote).toBeDefined();
    expect(QUOTES.some((q) => q.id === quote.id)).toBe(true);
  });

  it("filters to a tag, and falls back to the whole corpus if a tag is empty", () => {
    const discipline = deckFor(["discipline"]);
    expect(discipline.length).toBeGreaterThan(0);
    expect(discipline.every((q) => q.tags.includes("discipline"))).toBe(true);
    expect(deckFor([]).length).toBe(QUOTE_COUNT);
  });
});

describe("upcomingSchedule", () => {
  it("reaches every quote in a single pass", () => {
    // The whole point of the deck: one cycle covers the corpus exactly once, so
    // the collection view never has to say "not scheduled".
    const schedule = upcomingSchedule("2026-08-14", QUOTES);
    expect(schedule.size).toBe(QUOTE_COUNT);
  });

  it("puts today's quote on today", () => {
    const schedule = upcomingSchedule("2026-08-14", QUOTES);
    expect(schedule.get(quoteForDay("2026-08-14").id)).toBe("2026-08-14");
  });

  it("agrees with quoteForDay for every entry", () => {
    const schedule = upcomingSchedule("2026-08-14", QUOTES);
    for (const [id, day] of schedule) {
      expect(quoteForDay(day).id, `${id} on ${day}`).toBe(id);
    }
  });
});

describe("the corpus", () => {
  it("has unique ids", () => {
    expect(new Set(QUOTES.map((q) => q.id)).size).toBe(QUOTES.length);
  });

  it("has no duplicated quote text", () => {
    const seen = new Map<string, string>();
    for (const quote of QUOTES) {
      const key = quote.text
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, 60);
      expect(
        seen.get(key),
        `${quote.id} duplicates ${seen.get(key)}`,
      ).toBeUndefined();
      seen.set(key, quote.id);
    }
  });

  it("has an author and at least one tag on every quote", () => {
    for (const quote of QUOTES) {
      expect(quote.author.trim(), quote.id).not.toBe("");
      expect(quote.text.trim(), quote.id).not.toBe("");
      expect(quote.tags.length, quote.id).toBeGreaterThan(0);
    }
  });

  it("does not carry the attributions we know to be wrong", () => {
    // The standard failure mode of this genre — DESIGN.md §5.2. "We are what we
    // repeatedly do" is Will Durant summarising Aristotle, not Aristotle.
    const durant = QUOTES.find((q) => q.id === "durant-excellence");
    expect(durant?.author).toBe("Will Durant");
    expect(durant?.note).toContain("Aristotle");
  });
});
