import { describe, expect, it } from "vitest";
import { buildHabitHistory } from "@/lib/history";
import { entryKey, type Cadence, type Entry, type Habit } from "@/lib/types";

function habit(cadence: Cadence, extra: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Habit",
    emoji: "✅",
    color: "green",
    cadence,
    target: 1,
    order: 0,
    createdAt: "2026-08-10",
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
    ...extra,
  };
}

function entries(...rows: [string, number][]): Map<string, Entry> {
  return new Map(
    rows.map(([date, count]) => [
      entryKey("h", date),
      { habitId: "h", date, count, updatedAt: 1 },
    ]),
  );
}

const MON = "2026-08-10";
const TUE = "2026-08-11";
const WED = "2026-08-12";
const THU = "2026-08-13";

describe("buildHabitHistory", () => {
  it("is binary for a simple tick habit", () => {
    const history = buildHabitHistory(
      habit({ kind: "daily" }),
      entries([TUE, 1]),
      MON,
      WED,
      1,
    );
    expect(history.map((s) => s.level)).toEqual([0, 4, 0]);
  });

  it("grades a counted habit by progress toward its target", () => {
    // Unlike the aggregate grid, there is only one fraction here, so a 5-of-8
    // day should look different from a 1-of-8 day.
    const history = buildHabitHistory(
      habit({ kind: "daily" }, { target: 8 }),
      entries([MON, 1], [TUE, 4], [WED, 6], [THU, 8]),
      MON,
      THU,
      1,
    );
    expect(history.map((s) => s.level)).toEqual([1, 2, 3, 4]);
  });

  it("caps a level at 4 when the user overachieves", () => {
    const history = buildHabitHistory(
      habit({ kind: "daily" }, { target: 2 }),
      entries([MON, 9]),
      MON,
      MON,
      1,
    );
    expect(history[0].level).toBe(4);
    expect(history[0].score).toBe(1);
  });

  it("marks unscheduled days as rest, not as failures", () => {
    const history = buildHabitHistory(
      habit({ kind: "weekdays", days: [1] }), // Mondays only
      new Map(),
      MON,
      WED,
      1,
    );
    expect(history.map((s) => s.level)).toEqual([0, "rest", "rest"]);
  });

  it("marks days before the habit existed as rest", () => {
    const history = buildHabitHistory(
      habit({ kind: "daily" }, { createdAt: WED }),
      new Map(),
      MON,
      WED,
      1,
    );
    expect(history.map((s) => s.preStart)).toEqual([true, true, false]);
    expect(history.map((s) => s.level)).toEqual(["rest", "rest", 0]);
  });

  it("stops counting once a habit is archived", () => {
    const history = buildHabitHistory(
      habit({ kind: "daily" }, { archivedAt: WED }),
      new Map(),
      MON,
      THU,
      1,
    );
    expect(history.map((s) => s.level)).toEqual([0, 0, "rest", "rest"]);
  });
});
