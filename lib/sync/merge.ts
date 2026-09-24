/**
 * Merging a pulled payload into local state, and choosing what to push. Pure
 * and free of both IndexedDB and Postgres, so the rules can be tested directly.
 */

import { entryKey, type Entry, type Habit, type Settings } from "../types";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  MAX_ROWS_PER_REQUEST,
  wins,
} from "./protocol";

export type LocalSnapshot = {
  /** Includes tombstones. Filtering them out is the store's job, not the merge's. */
  habits: Habit[];
  entries: Map<string, Entry>;
  settings: { value: Settings; updatedAt: number };
};

export type Incoming = {
  habits: Habit[];
  entries: Entry[];
  settings: { value: Settings; updatedAt: number } | null;
};

export type MergeResult = {
  snapshot: LocalSnapshot;
  /**
   * Only what has to reach IndexedDB: rewriting a whole history on a routine
   * sync is the difference between a frame and a stall.
   */
  changedHabits: Habit[];
  changedEntries: Entry[];
  settingsChanged: boolean;
  /** Habits newly known to be deleted, whose local entries were dropped. */
  purgedHabitIds: string[];
};

/**
 * Last-write-wins. Habits merge before entries, so a tombstone arriving beside
 * its habit's entries is known before they are considered — otherwise the
 * history is reinstated, pushed back up, and the habit resurrects.
 */
export function mergeIncoming(
  local: LocalSnapshot,
  incoming: Incoming,
): MergeResult {
  const habits = new Map(local.habits.map((h) => [h.id, h]));
  const changedHabits: Habit[] = [];
  const purgedHabitIds: string[] = [];

  for (const habit of incoming.habits) {
    const existing = habits.get(habit.id);
    if (!wins(habit, existing, fingerprintHabit)) continue;

    habits.set(habit.id, habit);
    changedHabits.push(habit);

    // Here rather than in the entry loop, so a payload carrying the tombstone
    // alone — the common case — purges too.
    if (habit.deletedAt !== null && existing?.deletedAt == null) {
      purgedHabitIds.push(habit.id);
    }
  }

  const entries = new Map(local.entries);
  for (const id of purgedHabitIds) {
    for (const key of entries.keys()) {
      if (key.startsWith(`${id}:`)) entries.delete(key);
    }
  }

  const changedEntries: Entry[] = [];
  for (const entry of incoming.entries) {
    // The peer that sent these has not applied the tombstone yet; it will.
    const habit = habits.get(entry.habitId);
    if (!habit || habit.deletedAt !== null) continue;

    const key = entryKey(entry.habitId, entry.date);
    if (!wins(entry, entries.get(key), fingerprintEntry)) continue;

    entries.set(key, entry);
    changedEntries.push(entry);
  }

  const settingsChanged =
    incoming.settings !== null &&
    wins(incoming.settings, local.settings, fingerprintSettings);

  return {
    snapshot: {
      // Tombstones sort with everything else; the store filters them on read.
      habits: [...habits.values()].sort((a, b) => a.order - b.order),
      entries,
      settings: settingsChanged ? incoming.settings! : local.settings,
    },
    changedHabits,
    changedEntries,
    settingsChanged,
    purgedHabitIds,
  };
}

/**
 * Anything past `pushedThrough` — a local edit, or a pulled record re-sent
 * wastefully but harmlessly, where the alternative is a per-row dirty flag that
 * can drift. Note what is *not* here: no renumbering of `habit.order`, or two
 * devices trade order rewrites forever with the user touching nothing.
 */
export function collectPush(
  local: LocalSnapshot,
  pushedThrough: number,
  limit: number = MAX_ROWS_PER_REQUEST,
): {
  habits: Habit[];
  entries: Entry[];
  settings: LocalSnapshot["settings"] | null;
  complete: boolean;
} {
  const habits = local.habits
    .filter((h) => h.updatedAt > pushedThrough)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const entries = [...local.entries.values()]
    .filter((e) => e.updatedAt > pushedThrough)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const settings =
    local.settings.updatedAt > pushedThrough ? local.settings : null;

  /**
   * One cutoff for every collection, the push-side twin of `resumePoint`
   * (§13.5): the watermark is one number, so cutting each collection alone lets
   * a newer stamp carry it past entries that were never sent.
   */
  const cutoff = Math.min(cutAt(habits, limit), cutAt(entries, limit));
  if (cutoff === Infinity) return { habits, entries, settings, complete: true };

  const sent = (record: { updatedAt: number }) => record.updatedAt <= cutoff;
  return {
    // Sliced as well as filtered for the one case `cutAt` cannot avoid.
    habits: habits.filter(sent).slice(0, limit),
    entries: entries.filter(sent).slice(0, limit),
    settings: settings && sent(settings) ? settings : null,
    complete: false,
  };
}

/**
 * The highest stamp through which `rows` fits in one request, just below the
 * first that does not — so a run of equal stamps is never split and stepped
 * over. Past `limit` rows sharing the oldest stamp no cut avoids that, and the
 * first `limit` go.
 */
function cutAt(rows: { updatedAt: number }[], limit: number): number {
  if (rows.length <= limit) return Infinity;
  const below = rows[limit].updatedAt - 1;
  return below >= rows[0].updatedAt ? below : rows[limit - 1].updatedAt;
}

/**
 * The newest stamp actually sent, not `Date.now()`, which would step over an
 * edit made while the request was in flight and never select it again.
 */
export function watermarkAfterPush(
  sent: {
    habits: Habit[];
    entries: Entry[];
    settings: { updatedAt: number } | null;
  },
  previous: number,
): number {
  let max = previous;
  for (const h of sent.habits) max = Math.max(max, h.updatedAt);
  for (const e of sent.entries) max = Math.max(max, e.updatedAt);
  if (sent.settings) max = Math.max(max, sent.settings.updatedAt);
  return max;
}
