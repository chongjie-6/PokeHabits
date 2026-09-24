/**
 * Streak maths. See DESIGN.md §3.1. Rest days are stepped over, neither
 * extending nor breaking a streak, and the current day is forgiven while still
 * in progress: opening the app at 9am must not show a streak as broken.
 */

import type { DayStat } from "./history";

export type Streaks = {
  current: number;
  longest: number;
  /** Complete days in the window, for the summary line. */
  perfectDays: number;
  /** Mean completion across days that had something scheduled. */
  completionRate: number;
};

function isComplete(stat: DayStat): boolean {
  return stat.score !== null && stat.score >= 1;
}

function isRest(stat: DayStat): boolean {
  return stat.score === null;
}

/** `stats` must be ascending by date and end at today. */
export function computeStreaks(stats: DayStat[]): Streaks {
  let current = 0;
  let longest = 0;
  let run = 0;
  let perfectDays = 0;
  let scored = 0;
  let scoreSum = 0;

  for (const stat of stats) {
    if (isRest(stat)) continue;
    scored++;
    scoreSum += stat.score ?? 0;
    if (isComplete(stat)) {
      perfectDays++;
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // The most recent day gets one free pass if incomplete: it is not over yet.
  let forgivenToday = false;
  for (let i = stats.length - 1; i >= 0; i--) {
    const stat = stats[i];
    if (isRest(stat)) continue;
    if (isComplete(stat)) {
      current++;
      continue;
    }
    if (i === stats.length - 1 && !forgivenToday) {
      forgivenToday = true;
      continue;
    }
    break;
  }

  return {
    current,
    longest,
    perfectDays,
    completionRate: scored === 0 ? 0 : scoreSum / scored,
  };
}
