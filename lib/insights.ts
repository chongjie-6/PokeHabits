/**
 * Second-order reads of the history. See DESIGN.md §4.5. Where `history.ts`
 * answers "what happened on this day", this answers "what is the shape of it",
 * rolled up from a `DayStat[]` built for the grid and never persisted. Rest
 * days leave every denominator: a Sundays-only habit is not 14% complete.
 */

import {
  formatMonthShort,
  weekdayInitials,
  weekdayOf,
  weekdayShortNames,
} from "./dates";
import { buildHabitHistory, type DayStat } from "./history";
import { computeStreaks, type Streaks } from "./streaks";
import type { DayKey, Entry, Habit } from "./types";

export type Rate = {
  scheduled: number;
  completed: number;
  /** completed / scheduled, or null when nothing was ever scheduled here. */
  rate: number | null;
};

export type WeekdayRate = Rate & {
  /** 0 = Sunday … 6 = Saturday, as everywhere else. */
  weekday: number;
  label: string;
  initial: string;
};

export type MonthRate = Rate & {
  /** 'YYYY-MM'. */
  month: string;
  label: string;
};

function rate(scheduled: number, completed: number): Rate {
  return {
    scheduled,
    completed,
    rate: scheduled === 0 ? null : completed / scheduled,
  };
}

/**
 * The most actionable number here: "you miss Saturdays" is something a person
 * can act on. In habit-days, so one bad Saturday out of twenty does not read
 * the same as twenty half-done ones.
 */
export function weekdayRates(
  stats: DayStat[],
  weekStartsOn: 0 | 1,
): WeekdayRate[] {
  const scheduled = new Array<number>(7).fill(0);
  const completed = new Array<number>(7).fill(0);

  for (const stat of stats) {
    if (stat.preStart || stat.scheduled === 0) continue;
    const weekday = weekdayOf(stat.date);
    scheduled[weekday] += stat.scheduled;
    completed[weekday] += stat.completed;
  }

  const names = weekdayShortNames(weekStartsOn);
  const initials = weekdayInitials(weekStartsOn);

  return names.map((label, i) => {
    const weekday = (i + weekStartsOn) % 7;
    return {
      weekday,
      label,
      initial: initials[i],
      ...rate(scheduled[weekday], completed[weekday]),
    };
  });
}

/**
 * Calendar months rather than rolling windows, because "March" is a label the
 * reader already has. An empty month is kept with a null rate, so a gap in a
 * trend stays visible rather than closing up.
 */
export function monthRates(stats: DayStat[]): MonthRate[] {
  const order: string[] = [];
  const scheduled = new Map<string, number>();
  const completed = new Map<string, number>();

  for (const stat of stats) {
    if (stat.preStart) continue;
    const month = stat.date.slice(0, 7);
    if (!scheduled.has(month)) {
      order.push(month);
      scheduled.set(month, 0);
      completed.set(month, 0);
    }
    scheduled.set(month, scheduled.get(month)! + stat.scheduled);
    completed.set(month, completed.get(month)! + stat.completed);
  }

  return order.map((month) => ({
    month,
    label: formatMonthShort(`${month}-01`),
    ...rate(scheduled.get(month)!, completed.get(month)!),
  }));
}

/**
 * The number the Stats header cannot give: a 40-day run on one habit is
 * invisible in an aggregate streak that breaks when any habit is missed. Built
 * through `buildHabitHistory`, so an unscheduled day steps over the streak.
 */
export function perHabitStreaks(
  habits: Habit[],
  entries: Map<string, Entry>,
  from: DayKey,
  to: DayKey,
  weekStartsOn: 0 | 1,
): Map<string, Streaks> {
  const out = new Map<string, Streaks>();
  for (const habit of habits) {
    out.set(
      habit.id,
      computeStreaks(buildHabitHistory(habit, entries, from, to, weekStartsOn)),
    );
  }
  return out;
}

/** Without both, the headline is built on one bad Tuesday. */
const MIN_SAMPLE = 8;
const MIN_SPREAD = 0.2;

/** The best and worst weekday worth naming, or null when the difference is noise. */
export function weekdayExtremes(
  rates: WeekdayRate[],
): { best: WeekdayRate; worst: WeekdayRate } | null {
  const usable = rates.filter(
    (r) => r.rate !== null && r.scheduled >= MIN_SAMPLE,
  );
  if (usable.length < 3) return null;

  const sorted = [...usable].sort((a, b) => a.rate! - b.rate!);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  if (best.rate! - worst.rate! < MIN_SPREAD) return null;

  return { best, worst };
}
