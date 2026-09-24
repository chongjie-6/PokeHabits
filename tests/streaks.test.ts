import { describe, expect, it } from "vitest";
import type { DayStat } from "@/lib/history";
import { computeStreaks } from "@/lib/streaks";

/** Builds an ascending run of stats from a shorthand: 1 = complete, 0 = missed,
 *  'p' = partial, 'r' = rest day (nothing scheduled). */
function stats(shorthand: (1 | 0 | "p" | "r")[]): DayStat[] {
  return shorthand.map((value, index) => {
    const score = value === "r" ? null : value === "p" ? 0.5 : value;
    return {
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      scheduled: value === "r" ? 0 : 2,
      completed: value === "r" ? 0 : value === 1 ? 2 : value === "p" ? 1 : 0,
      score,
      level: score === null ? "rest" : score === 1 ? 4 : score === 0 ? 0 : 2,
      preStart: false,
    } satisfies DayStat;
  });
}

describe("computeStreaks", () => {
  it("counts a run ending today", () => {
    expect(computeStreaks(stats([1, 1, 1])).current).toBe(3);
  });

  it("breaks on a missed day", () => {
    expect(computeStreaks(stats([1, 1, 0, 1, 1])).current).toBe(2);
  });

  it("steps over rest days without breaking or extending", () => {
    // Rest days are deliberate, not failures — DESIGN.md §4.2.
    expect(computeStreaks(stats([1, "r", 1, "r", 1])).current).toBe(3);
  });

  it("forgives an incomplete day at the very end, because it is not over", () => {
    expect(computeStreaks(stats([1, 1, 1, 0])).current).toBe(3);
    expect(computeStreaks(stats([1, 1, 1, "p"])).current).toBe(3);
  });

  it("only forgives the final day, not the one before it", () => {
    expect(computeStreaks(stats([1, 1, 0, 0])).current).toBe(0);
  });

  it("does not forgive a past miss when today is a rest day", () => {
    // Yesterday is over, so its miss is real even though today is scheduled off.
    expect(computeStreaks(stats([1, 1, 0, "r"])).current).toBe(0);
  });

  it("treats a partial day as breaking the streak", () => {
    expect(computeStreaks(stats([1, "p", 1, 1])).current).toBe(2);
  });

  it("finds the longest run anywhere in the window", () => {
    expect(computeStreaks(stats([1, 1, 1, 1, 0, 1, 1])).longest).toBe(4);
  });

  it("counts perfect days and the completion rate over scored days only", () => {
    const result = computeStreaks(stats([1, "p", 0, "r"]));
    expect(result.perfectDays).toBe(1);
    // Rest day excluded: (1 + 0.5 + 0) / 3
    expect(result.completionRate).toBeCloseTo(0.5, 5);
  });

  it("handles an empty history", () => {
    expect(computeStreaks([])).toEqual({
      current: 0,
      longest: 0,
      perfectDays: 0,
      completionRate: 0,
    });
  });
});
