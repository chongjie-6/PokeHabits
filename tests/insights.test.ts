/**
 * Second-order reads of the history. The rollups are sums; what is worth
 * pinning is what they refuse to say — a weekday with nothing scheduled is not
 * a weekday missed, and a headline on two data points must not print.
 */

import { describe, expect, it } from "vitest";
import { buildHistory, type DayStat } from "@/lib/history";
import {
  monthRates,
  perHabitStreaks,
  weekdayExtremes,
  weekdayRates,
  type WeekdayRate,
} from "@/lib/insights";
import { entryKey, type Cadence, type Entry, type Habit } from "@/lib/types";

function habit(id: string, cadence: Cadence, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence,
    target: 1,
    order: 0,
    createdAt: "2026-01-01",
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
    ...over,
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

/** A bare stat row, for the rollups that only read the numbers. */
function stat(date: string, scheduled: number, completed: number): DayStat {
  return {
    date,
    scheduled,
    completed,
    score: scheduled === 0 ? null : completed / scheduled,
    level: "rest",
    preStart: false,
  };
}

// 2026-08-10 is a Monday.
const MON = "2026-08-10";
const TUE = "2026-08-11";
const SAT = "2026-08-15";
const SUN = "2026-08-16";

describe("weekdayRates", () => {
  it("rolls habit-days up by weekday, in the user's week order", () => {
    const rates = weekdayRates([stat(MON, 2, 1), stat(TUE, 2, 2)], 1);

    expect(rates.map((r) => r.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(rates[0]).toMatchObject({
      weekday: 1,
      scheduled: 2,
      completed: 1,
      rate: 0.5,
    });
    expect(rates[1]).toMatchObject({ weekday: 2, rate: 1 });
  });

  it("rotates to a Sunday week without moving the numbers", () => {
    const sunday = weekdayRates([stat(MON, 2, 1)], 0);
    expect(sunday.map((r) => r.label)[0]).toBe("Sun");
    expect(sunday.find((r) => r.weekday === 1)).toMatchObject({ rate: 0.5 });
  });

  it("reports a weekday with nothing scheduled as null, not as zero", () => {
    const rates = weekdayRates([stat(MON, 1, 0)], 1);

    // Monday was scheduled and missed; every other day was never asked for.
    expect(rates.find((r) => r.weekday === 1)!.rate).toBe(0);
    expect(rates.find((r) => r.weekday === 2)!.rate).toBeNull();
  });

  it("ignores days before the user started", () => {
    const before: DayStat = { ...stat(MON, 3, 0), preStart: true };
    expect(weekdayRates([before], 1).every((r) => r.rate === null)).toBe(true);
  });

  it("counts habit-days rather than whole days", () => {
    // One day with four of five done outranks one with one of one.
    const rates = weekdayRates([stat(MON, 5, 4), stat(TUE, 1, 1)], 1);
    expect(rates.find((r) => r.weekday === 1)!.scheduled).toBe(5);
    expect(rates.find((r) => r.weekday === 2)!.scheduled).toBe(1);
  });
});

describe("monthRates", () => {
  it("groups by calendar month, oldest first", () => {
    const months = monthRates([
      stat("2026-07-30", 2, 1),
      stat("2026-07-31", 2, 2),
      stat("2026-08-01", 1, 0),
    ]);

    expect(months.map((m) => m.month)).toEqual(["2026-07", "2026-08"]);
    expect(months[0]).toMatchObject({ scheduled: 4, completed: 3, rate: 0.75 });
    expect(months[1].rate).toBe(0);
  });

  it("keeps a month that had nothing scheduled, with a null rate", () => {
    const months = monthRates([
      stat("2026-07-01", 1, 1),
      stat("2026-08-01", 0, 0),
    ]);

    // Closing the gap would make a pause look like a continuous run.
    expect(months.map((m) => m.month)).toEqual(["2026-07", "2026-08"]);
    expect(months[1].rate).toBeNull();
  });

  it("drops pre-start days so a blank year does not open the trend", () => {
    const months = monthRates([
      { ...stat("2026-01-01", 0, 0), preStart: true },
      stat("2026-08-01", 1, 1),
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-08"]);
  });
});

describe("weekdayExtremes", () => {
  function rates(values: (number | null)[], scheduled = 20): WeekdayRate[] {
    return values.map((rate, i) => ({
      weekday: i,
      label: `d${i}`,
      initial: "d",
      scheduled: rate === null ? 0 : scheduled,
      completed: rate === null ? 0 : Math.round(scheduled * rate),
      rate,
    }));
  }

  it("names the best and worst day when the gap is wide enough", () => {
    const found = weekdayExtremes(rates([0.9, 0.8, 0.5, 0.8, 0.8, 0.8, 0.8]));
    expect(found).not.toBeNull();
    expect(found!.best.weekday).toBe(0);
    expect(found!.worst.weekday).toBe(2);
  });

  it("says nothing when every day is much the same", () => {
    expect(
      weekdayExtremes(rates([0.8, 0.82, 0.79, 0.8, 0.81, 0.8, 0.78])),
    ).toBeNull();
  });

  it("says nothing on a sample too small to mean anything", () => {
    // A wide spread, but two scheduled days on each end could produce it by
    // accident — which is exactly the headline not worth printing.
    expect(weekdayExtremes(rates([1, 0, 1, 0, 1, 0, 1], 2))).toBeNull();
  });

  it("says nothing when fewer than three days have any data", () => {
    expect(
      weekdayExtremes(rates([1, 0, null, null, null, null, null])),
    ).toBeNull();
  });
});

describe("perHabitStreaks", () => {
  it("gives each habit its own run, not the aggregate", () => {
    const habits = [
      habit("kept", { kind: "daily" }),
      habit("broken", { kind: "daily" }),
    ];
    const rows = entries(
      ["kept", MON, 1],
      ["kept", TUE, 1],
      ["broken", MON, 1],
      ["broken", TUE, 0],
    );

    const streaks = perHabitStreaks(habits, rows, MON, TUE, 1);

    // The aggregate streak is broken by `broken`; `kept` still has its two days.
    expect(streaks.get("kept")!.current).toBe(2);
    expect(streaks.get("broken")!.longest).toBe(1);
  });

  it("steps over a day the habit was not scheduled for", () => {
    const weekdays = habit("gym", { kind: "weekdays", days: [1, 2] });
    const rows = entries(["gym", MON, 1], ["gym", TUE, 1]);

    // Saturday and Sunday are rest days, so the run survives the weekend.
    const streaks = perHabitStreaks([weekdays], rows, MON, SUN, 1);
    expect(streaks.get("gym")!.current).toBe(2);
  });

  it("scores a counted habit the way its own grid does", () => {
    const water = habit("water", { kind: "daily" }, { target: 8 });
    const rows = entries(["water", MON, 8], ["water", TUE, 4]);

    const streaks = perHabitStreaks([water], rows, MON, TUE, 1);
    // Tuesday is the most recent day and gets the in-progress pass; Monday is
    // the only completed one.
    expect(streaks.get("water")!.longest).toBe(1);
  });

  it("agrees with the aggregate when there is only one habit", () => {
    const only = [habit("solo", { kind: "daily" })];
    const rows = entries(["solo", MON, 1], ["solo", TUE, 1], ["solo", SAT, 1]);
    const history = buildHistory(only, rows, MON, SAT, 1);

    expect(
      perHabitStreaks(only, rows, MON, SAT, 1).get("solo")!.perfectDays,
    ).toBe(history.filter((d) => d.score === 1).length);
  });
});
