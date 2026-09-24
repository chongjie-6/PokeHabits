/**
 * Performance floor for the heatmap pipeline (§10) — the computation, paint
 * cost needing a real device. Thresholds are loose on purpose, roughly 4×
 * observed: one tight enough to catch a 20% drift fails on a busy CI box and
 * gets deleted, where this still catches an accidental O(n²).
 */

import { describe, expect, it } from "vitest";
import { buildHistory, perHabitTotals } from "@/lib/history";
import { computeStreaks } from "@/lib/streaks";
import { addDays, todayKey } from "@/lib/dates";
import { entryKey, type Entry, type Habit } from "@/lib/types";

/** 52 weeks of grid, the widest the desktop layout shows. */
const SPAN_DAYS = 371;

function fixture(habitCount: number): {
  habits: Habit[];
  entries: Map<string, Entry>;
} {
  const to = todayKey(0);
  const from = addDays(to, -SPAN_DAYS);

  const habits: Habit[] = Array.from({ length: habitCount }, (_, i) => ({
    id: `h${i}`,
    name: `Habit ${i}`,
    emoji: "✅",
    color: "green",
    // A spread of cadences, so the weekly-quota path (the expensive one, since it
    // has to look back across the week) is exercised rather than avoided.
    cadence:
      i % 3 === 0
        ? { kind: "daily" }
        : i % 3 === 1
          ? { kind: "weekdays", days: [1, 2, 3, 4, 5] }
          : { kind: "weekly", times: 3 },
    target: i % 4 === 0 ? 8 : 1,
    order: i,
    createdAt: from,
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
  }));

  const entries = new Map<string, Entry>();
  for (const habit of habits) {
    for (let d = 0; d < SPAN_DAYS; d++) {
      // ~80% completion, so most days have a row to find.
      if (d % 5 === 0) continue;
      const date = addDays(from, d);
      entries.set(entryKey(habit.id, date), {
        habitId: habit.id,
        date,
        count: habit.target,
        updatedAt: 1,
      });
    }
  }

  return { habits, entries };
}

function median(run: () => void, iterations = 9): number {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(iterations / 2)];
}

describe("heatmap pipeline at a year of data", () => {
  it("builds 371 days across 5 habits well inside the frame budget", () => {
    const { habits, entries } = fixture(5);
    const to = todayKey(0);
    const from = addDays(to, -SPAN_DAYS);

    const ms = median(() => buildHistory(habits, entries, from, to, 1));
    console.log(
      `buildHistory  5 habits × ${SPAN_DAYS} days: ${ms.toFixed(2)}ms`,
    );

    expect(ms).toBeLessThan(32);
  });

  it("stays usable at 20 habits, which is far past a realistic list", () => {
    const { habits, entries } = fixture(20);
    const to = todayKey(0);
    const from = addDays(to, -SPAN_DAYS);

    const ms = median(() => buildHistory(habits, entries, from, to, 1));
    console.log(
      `buildHistory 20 habits × ${SPAN_DAYS} days: ${ms.toFixed(2)}ms`,
    );

    expect(ms).toBeLessThan(120);
  });

  it("scales roughly linearly in habit count", () => {
    const to = todayKey(0);
    const from = addDays(to, -SPAN_DAYS);

    const small = fixture(5);
    const large = fixture(20);

    const t5 = median(() =>
      buildHistory(small.habits, small.entries, from, to, 1),
    );
    const t20 = median(() =>
      buildHistory(large.habits, large.entries, from, to, 1),
    );
    const factor = t20 / t5;
    console.log(`scaling 5→20 habits (4× data): ${factor.toFixed(2)}×`);

    // 4× the habits should cost ~4×. A quadratic day loop would land near 16×;
    // the ceiling sits well below that and well above linear-plus-noise.
    expect(factor).toBeLessThan(9);
  });

  it("computes streaks and totals in negligible time", () => {
    const { habits, entries } = fixture(5);
    const to = todayKey(0);
    const from = addDays(to, -SPAN_DAYS);
    const stats = buildHistory(habits, entries, from, to, 1);

    const streakMs = median(() => computeStreaks(stats));
    const totalsMs = median(() => perHabitTotals(habits, entries, from, to, 1));
    console.log(
      `computeStreaks: ${streakMs.toFixed(3)}ms | perHabitTotals: ${totalsMs.toFixed(2)}ms`,
    );

    expect(streakMs).toBeLessThan(8);
    expect(totalsMs).toBeLessThan(120);
  });
});
