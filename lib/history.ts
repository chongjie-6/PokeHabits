/**
 * Cadence evaluation and day rollups. See DESIGN.md §3.1 and §4.2. Never
 * persisted: a full year rebuild is well inside the frame budget, and derived
 * state written to disk is the main way an app like this rots.
 */

import { addDays, daysBetween, startOfWeek, weekdayOf } from "./dates";
import { entryKey, type DayKey, type Entry, type Habit } from "./types";

export type Level = 0 | 1 | 2 | 3 | 4 | "rest";

export type HabitDayState = {
  habit: Habit;
  /** Was this habit expected today? */
  scheduled: boolean;
  count: number;
  done: boolean;
};

export type DayStat = {
  date: DayKey;
  scheduled: number;
  completed: number;
  /** completed / scheduled, or null when nothing was scheduled (a rest day). */
  score: number | null;
  level: Level;
  /** True for days before the user created their first habit. */
  preStart: boolean;
};

/** Is the habit alive on this day — created, and not yet archived? */
export function isActive(habit: Habit, day: DayKey): boolean {
  if (day < habit.createdAt) return false;
  if (habit.archivedAt && day >= habit.archivedAt) return false;
  return true;
}

function isDone(habit: Habit, count: number): boolean {
  return count >= habit.target;
}

/**
 * A `weekly: n times` habit counts toward the day's total only until its quota
 * is met, then rests for the remainder of the week — which rewards
 * front-loading rather than punishing it.
 */
export function habitsForDay(
  habits: Habit[],
  entries: Map<string, Entry>,
  day: DayKey,
  weekStartsOn: 0 | 1,
): HabitDayState[] {
  const weekStart = startOfWeek(day, weekStartsOn);
  const daysIntoWeek = daysBetween(weekStart, day);
  const weekday = weekdayOf(day);

  // Count weekly-cadence completions earlier in the same week.
  const weeklyDone = new Map<string, number>();
  for (let i = 0; i < daysIntoWeek; i++) {
    const prev = addDays(weekStart, i);
    for (const habit of habits) {
      if (habit.cadence.kind !== "weekly") continue;
      if (!isActive(habit, prev)) continue;
      const count = entries.get(entryKey(habit.id, prev))?.count ?? 0;
      if (isDone(habit, count)) {
        weeklyDone.set(habit.id, (weeklyDone.get(habit.id) ?? 0) + 1);
      }
    }
  }

  return habits
    .filter((habit) => isActive(habit, day))
    .map((habit) => {
      const count = entries.get(entryKey(habit.id, day))?.count ?? 0;
      const done = isDone(habit, count);

      let scheduled: boolean;
      switch (habit.cadence.kind) {
        case "daily":
          scheduled = true;
          break;
        case "weekdays":
          scheduled = habit.cadence.days.includes(weekday);
          break;
        case "weekly":
          scheduled = (weeklyDone.get(habit.id) ?? 0) < habit.cadence.times;
          break;
      }

      return { habit, scheduled, count, done };
    });
}

export function levelFor(score: number | null): Level {
  if (score === null) return "rest";
  if (score <= 0) return 0;
  if (score < 0.34) return 1;
  if (score < 0.67) return 2;
  if (score < 1) return 3;
  return 4;
}

export function statFor(
  habits: Habit[],
  entries: Map<string, Entry>,
  day: DayKey,
  weekStartsOn: 0 | 1,
  firstDay: DayKey | null,
): DayStat {
  const states = habitsForDay(habits, entries, day, weekStartsOn);
  let scheduled = 0;
  let completed = 0;

  for (const state of states) {
    if (!state.scheduled) continue;
    scheduled++;
    if (state.done) completed++;
  }

  const score = scheduled === 0 ? null : completed / scheduled;
  const preStart = firstDay === null || day < firstDay;

  return {
    date: day,
    scheduled,
    completed,
    score,
    // A blank year before the app existed should read as neutral, not failure.
    level: preStart ? "rest" : levelFor(score),
    preStart,
  };
}

/** The day the user's earliest habit was created, or null if there are none. */
export function firstDayOf(habits: Habit[]): DayKey | null {
  if (habits.length === 0) return null;
  return habits.reduce(
    (min, h) => (h.createdAt < min ? h.createdAt : min),
    habits[0].createdAt,
  );
}

/**
 * One habit's history, for its own grid. The aggregate treats a counted habit
 * as all-or-nothing, a fraction of a fraction being unreadable at 11px; here
 * there is only one fraction, so `count / target` drives the level.
 */
export function buildHabitHistory(
  habit: Habit,
  entries: Map<string, Entry>,
  from: DayKey,
  to: DayKey,
  weekStartsOn: 0 | 1,
): DayStat[] {
  const only = [habit];
  const span = daysBetween(from, to);
  const out: DayStat[] = [];

  for (let i = 0; i <= span; i++) {
    const day = addDays(from, i);
    const preStart = day < habit.createdAt;
    const state = habitsForDay(only, entries, day, weekStartsOn)[0];

    if (!state || !state.scheduled) {
      out.push({
        date: day,
        scheduled: 0,
        completed: 0,
        score: null,
        level: "rest",
        preStart,
      });
      continue;
    }

    const score = Math.min(1, state.count / habit.target);
    out.push({
      date: day,
      scheduled: 1,
      completed: state.done ? 1 : 0,
      score,
      level: preStart ? "rest" : levelFor(score),
      preStart,
    });
  }

  return out;
}

export type HabitTotals = { scheduled: number; completed: number };

/** Per-habit scheduled/completed totals across an inclusive range. */
export function perHabitTotals(
  habits: Habit[],
  entries: Map<string, Entry>,
  from: DayKey,
  to: DayKey,
  weekStartsOn: 0 | 1,
): Map<string, HabitTotals> {
  const totals = new Map<string, HabitTotals>();
  for (const habit of habits)
    totals.set(habit.id, { scheduled: 0, completed: 0 });

  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) {
    const day = addDays(from, i);
    for (const state of habitsForDay(habits, entries, day, weekStartsOn)) {
      if (!state.scheduled) continue;
      const total = totals.get(state.habit.id);
      if (!total) continue;
      total.scheduled++;
      if (state.done) total.completed++;
    }
  }

  return totals;
}

/** Inclusive day-by-day rollup, oldest first. */
export function buildHistory(
  habits: Habit[],
  entries: Map<string, Entry>,
  from: DayKey,
  to: DayKey,
  weekStartsOn: 0 | 1,
): DayStat[] {
  const firstDay = firstDayOf(habits);
  const span = daysBetween(from, to);
  const out: DayStat[] = [];
  for (let i = 0; i <= span; i++) {
    out.push(
      statFor(habits, entries, addDays(from, i), weekStartsOn, firstDay),
    );
  }
  return out;
}
