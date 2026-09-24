/**
 * Which creatures a history has discovered (§5.5). Derived, never persisted,
 * like streaks: the Nth finished week at `QUALIFYING_RATE` finds the Nth one.
 */

import { CREATURES } from "@/data/creatures";
import { startOfWeek } from "./dates";
import type { DayStat } from "./history";
import type { DayKey } from "./types";

export const QUALIFYING_RATE = 0.8;

export type WeekTally = { completed: number; scheduled: number };

export type Discoveries = {
  /** How many of `CREATURES`, from the front, have been found. */
  found: number;
  thisWeek: WeekTally;
};

function qualifies(week: WeekTally): boolean {
  return (
    week.scheduled > 0 && week.completed / week.scheduled >= QUALIFYING_RATE
  );
}

/** `stats` from `buildHistory`; only weeks that have ended can discover. */
export function discoveries(
  stats: DayStat[],
  today: DayKey,
  weekStartsOn: 0 | 1,
): Discoveries {
  const weeks = new Map<DayKey, WeekTally>();
  for (const stat of stats) {
    if (stat.preStart || stat.date > today) continue;
    const start = startOfWeek(stat.date, weekStartsOn);
    let week = weeks.get(start);
    if (!week) weeks.set(start, (week = { completed: 0, scheduled: 0 }));
    week.completed += stat.completed;
    week.scheduled += stat.scheduled;
  }

  const current = startOfWeek(today, weekStartsOn);
  let qualifying = 0;
  for (const [start, week] of weeks) {
    if (start < current && qualifies(week)) qualifying++;
  }

  return {
    found: Math.min(qualifying, CREATURES.length),
    thisWeek: weeks.get(current) ?? { completed: 0, scheduled: 0 },
  };
}

export { CREATURES };
