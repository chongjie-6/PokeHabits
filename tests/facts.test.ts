import { describe, expect, it } from "vitest";
import { FACTS } from "@/data/facts";
import { corpusFor, dailyForDay, repeatGapFor, scheduleFor } from "@/lib/daily";
import { addDays } from "@/lib/dates";
import { deckFor, factForDay, FACT_COUNT } from "@/lib/facts";

describe("the fact deck", () => {
  it("is deterministic — the same day always yields the same fact", () => {
    expect(factForDay("2026-08-14").id).toBe(factForDay("2026-08-14").id);
  });

  it("never repeats within a full pass of the deck", () => {
    const seen = new Set<string>();
    let day = "2026-01-01";
    for (let i = 0; i < FACT_COUNT; i++) {
      seen.add(factForDay(day).id);
      day = addDays(day, 1);
    }
    expect(seen.size).toBe(FACT_COUNT);
  });

  it("holds the seam across three cycles", () => {
    const window = repeatGapFor("facts");
    const lastSeen = new Map<string, number>();
    let day = "2026-01-01";

    for (let i = 0; i < FACT_COUNT * 3; i++) {
      const { id } = factForDay(day);
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

  it("filters to a tag, and falls back to the whole corpus if a tag is empty", () => {
    const space = deckFor(["space"]);
    expect(space.length).toBeGreaterThan(0);
    expect(space.every((f) => f.tags.includes("space"))).toBe(true);
    expect(deckFor([]).length).toBe(FACT_COUNT);
  });

  it("runs a sequence of its own, not the quotes' one", () => {
    // Switching modes should land you mid-stream in the other corpus rather
    // than replaying it in step with the first.
    const quotes = corpusFor("quotes").map((item) => item.id);
    const facts = corpusFor("facts").map((item) => item.id);
    expect(quotes.some((id) => facts.includes(id))).toBe(false);
  });
});

describe("dailyForDay", () => {
  it("returns the mode's corpus, flattened", () => {
    const fact = dailyForDay("2026-08-14", "facts");
    expect(FACTS.some((f) => f.id === fact.id)).toBe(true);
    // A fact's only attribution is where it can be checked, so that is the
    // byline — there is no second line under it.
    expect(fact.byline).not.toBe("");
    expect(fact.detail).toBeUndefined();
  });

  it("puts a quote's author on the byline and its source beneath", () => {
    const quote = dailyForDay("2026-08-14", "quotes");
    expect(quote.byline).not.toBe("");
  });

  it("schedules every fact within a pass", () => {
    const schedule = scheduleFor("2026-08-14", "facts");
    expect(schedule.size).toBe(FACT_COUNT);
    for (const [id, day] of schedule) {
      expect(factForDay(day).id, `${id} on ${day}`).toBe(id);
    }
  });
});

describe("the fact corpus", () => {
  it("has unique ids", () => {
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length);
  });

  it("has no duplicated fact text", () => {
    const seen = new Map<string, string>();
    for (const fact of FACTS) {
      const key = fact.text
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, 60);
      expect(
        seen.get(key),
        `${fact.id} duplicates ${seen.get(key)}`,
      ).toBeUndefined();
      seen.set(key, fact.id);
    }
  });

  it("gives every fact a source and at least one tag", () => {
    // DESIGN.md §5.3: a fact has no author, so the source is the whole of its
    // provenance and is not allowed to be missing.
    for (const fact of FACTS) {
      expect(fact.text.trim(), fact.id).not.toBe("");
      expect(fact.source.trim(), fact.id).not.toBe("");
      expect(fact.tags.length, fact.id).toBeGreaterThan(0);
    }
  });

  it("corrects the popular version where it carries one", () => {
    // The genre's failure mode is the factoid nobody checked. Where we keep a
    // fact whose famous form is wrong, the correction ships with it.
    const whale = FACTS.find((f) => f.id === "blue-whale-heart");
    expect(whale?.note).toContain("folklore");
    const carrots = FACTS.find((f) => f.id === "purple-carrots");
    expect(carrots?.note).toContain("William of Orange");
  });

  it("is long enough for the deck to promise a useful gap", () => {
    expect(repeatGapFor("facts")).toBeGreaterThanOrEqual(7);
  });
});
