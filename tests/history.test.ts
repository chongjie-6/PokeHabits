import { describe, expect, it } from "vitest";
import { buildHistory, habitsForDay, levelFor, statFor } from "@/lib/history";
import { entryKey, type Cadence, type Entry, type Habit } from "@/lib/types";

function habit(
  id: string,
  cadence: Cadence,
  extra: Partial<Habit> = {},
): Habit {
  return {
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence,
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
    ...extra,
  };
}

function entries(...rows: [string, string, number][]): Map<string, Entry> {
  return new Map(
    rows.map(([habitId, date, count]) => [
      entryKey(habitId, date),
      { habitId, date, count, updatedAt: 1 },
    ]),
  );
}

// 2026-08-10 is a Monday; 2026-08-16 is the Sunday that closes that week.
const MON = "2026-08-10";
const TUE = "2026-08-11";
const WED = "2026-08-12";
const THU = "2026-08-13";
const SAT = "2026-08-15";

describe("cadence scheduling", () => {
  it("schedules a daily habit every day", () => {
    const habits = [habit("d", { kind: "daily" })];
    for (const day of [MON, TUE, SAT]) {
      expect(habitsForDay(habits, new Map(), day, 1)[0].scheduled).toBe(true);
    }
  });

  it("schedules a weekdays habit only on its days", () => {
    const habits = [habit("w", { kind: "weekdays", days: [1, 3, 5] })];
    expect(habitsForDay(habits, new Map(), MON, 1)[0].scheduled).toBe(true); // Mon
    expect(habitsForDay(habits, new Map(), TUE, 1)[0].scheduled).toBe(false); // Tue
    expect(habitsForDay(habits, new Map(), WED, 1)[0].scheduled).toBe(true); // Wed
  });

  it("excludes a habit before it was created or after it was archived", () => {
    const habits = [
      habit("h", { kind: "daily" }, { createdAt: TUE, archivedAt: THU }),
    ];
    expect(habitsForDay(habits, new Map(), MON, 1)).toHaveLength(0);
    expect(habitsForDay(habits, new Map(), TUE, 1)).toHaveLength(1);
    expect(habitsForDay(habits, new Map(), THU, 1)).toHaveLength(0);
  });
});

describe("weekly quota cadence", () => {
  const habits = [habit("gym", { kind: "weekly", times: 2 })];

  it("stays scheduled until the quota is met, then becomes a rest day", () => {
    const done = entries(["gym", MON, 1], ["gym", TUE, 1]);

    // Quota is 2 and both were done on Mon and Tue.
    expect(habitsForDay(habits, done, MON, 1)[0].scheduled).toBe(true);
    expect(habitsForDay(habits, done, TUE, 1)[0].scheduled).toBe(true);
    expect(habitsForDay(habits, done, WED, 1)[0].scheduled).toBe(false);
    expect(habitsForDay(habits, done, SAT, 1)[0].scheduled).toBe(false);
  });

  it("stays scheduled all week if the quota is never met", () => {
    const done = entries(["gym", MON, 1]);
    expect(habitsForDay(habits, done, SAT, 1)[0].scheduled).toBe(true);
  });

  it("resets at the start of the next week", () => {
    const done = entries(["gym", MON, 1], ["gym", TUE, 1]);
    const nextMonday = "2026-08-17";
    expect(habitsForDay(habits, done, nextMonday, 1)[0].scheduled).toBe(true);
  });

  it("counts the quota against the user's chosen week start", () => {
    // With a Sunday-start week, 2026-08-16 (Sun) opens a new week, so a quota
    // filled on Mon/Tue no longer applies to it.
    const done = entries(["gym", MON, 1], ["gym", TUE, 1]);
    expect(habitsForDay(habits, done, "2026-08-16", 1)[0].scheduled).toBe(
      false,
    );
    expect(habitsForDay(habits, done, "2026-08-16", 0)[0].scheduled).toBe(true);
  });
});

describe("counted habits", () => {
  it("is only done once the target is reached", () => {
    const habits = [habit("water", { kind: "daily" }, { target: 8 })];
    const partial = entries(["water", MON, 5]);
    const full = entries(["water", MON, 8]);

    expect(habitsForDay(habits, partial, MON, 1)[0].done).toBe(false);
    expect(habitsForDay(habits, full, MON, 1)[0].done).toBe(true);
  });
});

describe("levelFor", () => {
  it("buckets a score into the ramp", () => {
    expect(levelFor(null)).toBe("rest");
    expect(levelFor(0)).toBe(0);
    expect(levelFor(0.25)).toBe(1);
    expect(levelFor(0.5)).toBe(2);
    expect(levelFor(0.8)).toBe(3);
    expect(levelFor(1)).toBe(4);
  });
});

describe("statFor", () => {
  const habits = [
    habit("a", { kind: "daily" }),
    habit("b", { kind: "daily" }),
    habit("c", { kind: "weekdays", days: [0] }), // Sundays only
  ];

  it("ignores unscheduled habits in the day's score", () => {
    const stat = statFor(habits, entries(["a", MON, 1]), MON, 1, "2026-08-01");
    expect(stat.scheduled).toBe(2); // c is not scheduled on a Monday
    expect(stat.completed).toBe(1);
    expect(stat.score).toBe(0.5);
    expect(stat.level).toBe(2);
  });

  it("reports a rest day when nothing was scheduled", () => {
    const sundayOnly = [habit("c", { kind: "weekdays", days: [0] })];
    const stat = statFor(sundayOnly, new Map(), MON, 1, "2026-08-01");
    expect(stat.score).toBeNull();
    expect(stat.level).toBe("rest");
  });

  it("treats days before the first habit as neutral, not as failures", () => {
    const stat = statFor(habits, new Map(), "2026-07-01", 1, "2026-08-01");
    expect(stat.preStart).toBe(true);
    expect(stat.level).toBe("rest");
  });
});

describe("buildHistory", () => {
  it("returns one ascending stat per day, inclusive", () => {
    const history = buildHistory(
      [habit("a", { kind: "daily" })],
      entries(["a", TUE, 1]),
      MON,
      THU,
      1,
    );

    expect(history.map((s) => s.date)).toEqual([MON, TUE, WED, THU]);
    expect(history.map((s) => s.level)).toEqual([0, 4, 0, 0]);
  });
});
