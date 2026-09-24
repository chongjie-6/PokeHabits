/**
 * The legacy-import migration and the colour normaliser. `normaliseHabit` runs
 * against data an older version wrote, where the only way to find out it is
 * wrong is a user restoring a backup they made a year ago.
 */

import { describe, expect, it } from "vitest";
import {
  isHexColor,
  normaliseHabit,
  normaliseHabitColor,
  type Habit,
} from "@/lib/types";

/** A v1 habit: everything except the sync metadata `Synced` adds. */
function legacy(over: Record<string, unknown> = {}) {
  return {
    id: "h",
    name: "read",
    emoji: "📖",
    color: "green" as const,
    cadence: { kind: "daily" } as const,
    target: 1,
    order: 0,
    createdAt: "2020-03-14",
    archivedAt: null,
    ...over,
  } as Omit<Habit, "updatedAt" | "deletedAt"> & Partial<Habit>;
}

describe("normaliseHabit", () => {
  it("dates a v1 habit from its creation day, not from now", () => {
    const habit = normaliseHabit(legacy());

    // The whole point: stamping a year-old habit "now" would let a stale backup
    // outrank edits already on the server.
    expect(habit.updatedAt).toBe(Date.parse("2020-03-14T00:00:00Z"));
    expect(habit.updatedAt).toBeLessThan(Date.now());
    expect(habit.deletedAt).toBeNull();
  });

  it("falls back to the stamp that loses every merge when the date is unreadable", () => {
    expect(normaliseHabit(legacy({ createdAt: "not a date" })).updatedAt).toBe(
      0,
    );
    expect(normaliseHabit(legacy({ createdAt: "" })).updatedAt).toBe(0);
  });

  it("leaves a v2 habit's own metadata alone", () => {
    const habit = normaliseHabit(legacy({ updatedAt: 12345, deletedAt: 999 }));
    expect(habit.updatedAt).toBe(12345);
    expect(habit.deletedAt).toBe(999);
  });

  it("keeps an explicit zero rather than treating it as absent", () => {
    // `0` is a real stamp — the one that loses every merge — and `??` on a
    // falsy-but-present value is the classic way to lose it.
    expect(normaliseHabit(legacy({ updatedAt: 0 })).updatedAt).toBe(0);
  });

  it("carries every other field through untouched", () => {
    const habit = normaliseHabit(legacy({ name: "run", target: 3, order: 2 }));
    expect(habit).toMatchObject({ id: "h", name: "run", target: 3, order: 2 });
  });
});

describe("normaliseHabitColor", () => {
  it("passes a palette key through as a key", () => {
    // Keys stay keys because each resolves to a different value per theme; a
    // stored hex can only ever be one of the two.
    expect(normaliseHabitColor("green")).toBe("green");
    expect(normaliseHabitColor("teal")).toBe("teal");
  });

  it("lowercases a hex so two devices fingerprint it alike", () => {
    expect(normaliseHabitColor("#AABBCC")).toBe("#aabbcc");
  });

  it("rejects anything that is neither", () => {
    for (const value of ["#abc", "#gggggg", "rebeccapurple", "", "#aabbccdd"]) {
      expect(normaliseHabitColor(value)).toBeNull();
    }
  });
});

describe("isHexColor", () => {
  it("accepts a six-digit hex in either case and nothing else", () => {
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("#A1B2C3")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor(42)).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });
});
