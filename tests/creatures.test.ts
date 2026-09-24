import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CREATURES, discoveries } from "@/lib/creatures";
import type { DayStat } from "@/lib/history";

/** Monday 2026-08-03 onward; each entry is one day's `[completed, scheduled]`. */
function stats(days: [number, number][], preStart = false): DayStat[] {
  return days.map(([completed, scheduled], i) => ({
    date: addDays("2026-08-03", i),
    scheduled,
    completed,
    score: scheduled === 0 ? null : completed / scheduled,
    level: scheduled === 0 ? "rest" : 4,
    preStart,
  }));
}

const week = (completed: number, scheduled: number): [number, number][] => [
  [completed, scheduled],
  ...Array.from({ length: 6 }, (): [number, number] => [0, 0]),
];

// Two weeks later, so every fixture week has ended.
const LATER = "2026-09-01";

describe("discoveries", () => {
  it("counts a finished week at exactly the threshold", () => {
    expect(discoveries(stats(week(8, 10)), LATER, 1).found).toBe(1);
  });

  it("does not count a week just under it", () => {
    expect(discoveries(stats(week(79, 100)), LATER, 1).found).toBe(0);
  });

  it("skips a week with nothing scheduled", () => {
    expect(discoveries(stats(week(0, 0)), LATER, 1).found).toBe(0);
  });

  it("never counts the week still in progress", () => {
    const result = discoveries(stats(week(5, 5)), "2026-08-05", 1);
    expect(result.found).toBe(0);
    expect(result.thisWeek).toEqual({ completed: 5, scheduled: 5 });
  });

  it("ignores days before the first habit", () => {
    expect(discoveries(stats(week(5, 5), true), LATER, 1).found).toBe(0);
  });

  it("finds one creature per qualifying week, capped at the corpus", () => {
    const good = Array.from({ length: CREATURES.length + 3 }, () =>
      week(1, 1),
    ).flat();
    const bad = [...week(1, 1), ...week(0, 1), ...week(1, 1)];
    expect(discoveries(stats(bad), "2027-01-01", 1).found).toBe(2);
    expect(discoveries(stats(good), "2027-06-01", 1).found).toBe(
      CREATURES.length,
    );
  });
});

describe("CREATURES", () => {
  it("has unique ids", () => {
    const ids = CREATURES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws every sprite as a square using only its own colours", () => {
    for (const { id, sprite, colors } of CREATURES) {
      for (const row of sprite) {
        expect(row.length, id).toBe(sprite.length);
        for (const pixel of row) {
          if (pixel !== ".")
            expect(colors[pixel], `${id} ${pixel}`).toBeTruthy();
        }
      }
    }
  });
});
