"use client";

/**
 * The client store. See DESIGN.md §7.2. Reads are synchronous from memory,
 * writes go to IndexedDB fire-and-forget — the UI never awaits one.
 * `useSyncExternalStore` rather than `useState` + emitter, which would tear.
 */

import { useEffect, useSyncExternalStore } from "react";
import * as db from "./db";
import { todayKey } from "./dates";
import { HAPTIC_DONE, HAPTIC_TICK, vibrate } from "./haptics";
import type { LocalSnapshot, MergeResult } from "./sync/merge";
import { TOMBSTONE_TTL_MS } from "./sync/protocol";
import {
  DEFAULT_SETTINGS,
  entryKey,
  HABIT_COLORS,
  normaliseHabit,
  type AnyExportBundle,
  type Cadence,
  type DayKey,
  type Entry,
  type ExportBundle,
  type Habit,
  type HabitColor,
  type Settings,
} from "./types";

/** What the sync layer is doing, for the benefit of the UI. */
export type SyncStatus =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "error"; message: string };

export type State = {
  /** False until IndexedDB has been read. Gate any data-dependent UI on this. */
  hydrated: boolean;
  /** Live habits only. Deleted ones live in `tombstones` and never reach the UI. */
  habits: Habit[];
  entries: Map<string, Entry>;
  settings: Settings;
  /** Deleted habits, kept out of `habits` so no screen has to filter them. */
  tombstones: Habit[];
  settingsUpdatedAt: number;
  sync: db.SyncMeta;
  syncStatus: SyncStatus;
};

const EMPTY: State = {
  hydrated: false,
  habits: [],
  entries: new Map(),
  settings: DEFAULT_SETTINGS,
  tombstones: [],
  settingsUpdatedAt: 0,
  sync: db.NO_SYNC,
  syncStatus: { kind: "off" },
};

let state: State = EMPTY;
let version = 0;

const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A version counter rather than the state object: `getSnapshot` must not
// allocate.
const getSnapshot = () => version;
const getServerSnapshot = () => 0;

/**
 * The state as it stands, read without subscribing. For the callers that are
 * not components, and for the tests. A component wants `useOpenHabits`.
 */
export function currentState(): State {
  return state;
}

/** `EMPTY` on the server and the first client render, so SSR and hydration agree. */
export function useOpenHabits(): State {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return currentState();
}

/** Mount once, high in the tree, to read IndexedDB into memory. */
export function useHydrate(): void {
  useEffect(() => {
    void hydrate();
  }, []);
}

let hydrating: Promise<void> | null = null;

/** Exported for the tests, which drive the store directly; the app uses `useHydrate`. */
export function hydrate(): Promise<void> {
  if (state.hydrated) return Promise.resolve();
  if (hydrating) return hydrating;

  hydrating = db
    .loadAll()
    .then((snapshot) => {
      const entries = new Map<string, Entry>();
      for (const entry of snapshot.entries) {
        entries.set(entryKey(entry.habitId, entry.date), entry);
      }

      const { kept, expired } = collectTombstones(snapshot.tombstones);

      state = {
        ...state,
        hydrated: true,
        habits: snapshot.habits,
        entries,
        settings: snapshot.settings,
        tombstones: kept,
        settingsUpdatedAt: snapshot.settingsUpdatedAt,
        sync: snapshot.sync,
      };
      emit();

      // After the emit: a tidy-up has no business in front of the first paint.
      if (expired.length > 0) persist(() => db.forgetHabits(expired));
    })
    .catch((error) => {
      // Private-mode Safari and similar. Run in memory rather than showing a
      // dead app — the user loses persistence, not the session.
      console.error("openhabits: could not open the database", error);
      state = { ...state, hydrated: true };
      emit();
    });

  return hydrating;
}

/**
 * Collected on hydrate rather than on a timer: once per session is enough, and
 * an unopened device keeping its tombstones is the safe direction. `deletedAt`
 * rather than `updatedAt`, which a merge can move without the delete ageing.
 */
function collectTombstones(tombstones: Habit[]): {
  kept: Habit[];
  expired: string[];
} {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const kept: Habit[] = [];
  const expired: string[] = [];

  for (const habit of tombstones) {
    // A clock far enough ahead could have stamped a deletion in the future;
    // keeping such a row is the harmless direction.
    if (habit.deletedAt !== null && habit.deletedAt < cutoff)
      expired.push(habit.id);
    else kept.push(habit);
  }

  return { kept, expired };
}

function persist(run: () => Promise<unknown>): void {
  void run().catch((error) => {
    console.error("openhabits: write failed", error);
  });
}

export function today(): DayKey {
  return todayKey(state.settings.dayStartHour);
}

export function habitById(id: string): Habit | undefined {
  return state.habits.find((h) => h.id === id);
}

export function countFor(habitId: string, date: DayKey): number {
  return state.entries.get(entryKey(habitId, date))?.count ?? 0;
}

/** Advance a habit on a day: 0 → 1 → … → target → 0. */
export function toggleEntry(habitId: string, date: DayKey): void {
  const habit = habitById(habitId);
  if (!habit) return;

  const current = countFor(habitId, date);
  const next = current >= habit.target ? 0 : current + 1;

  // Silent on the wrap back to zero: that is a correction, not a record.
  if (state.settings.haptics && next > 0) {
    vibrate(next >= habit.target ? HAPTIC_DONE : HAPTIC_TICK);
  }

  setCount(habitId, date, next);
}

export function setCount(habitId: string, date: DayKey, count: number): void {
  const entry: Entry = {
    habitId,
    date,
    count: Math.max(0, count),
    updatedAt: Date.now(),
  };

  const entries = new Map(state.entries);
  entries.set(entryKey(habitId, date), entry);
  state = { ...state, entries };
  emit();

  persist(() => db.putEntry(entry));
}

export type NewHabit = {
  name: string;
  emoji: string;
  color?: HabitColor;
  cadence?: Cadence;
  target?: number;
};

export function addHabit(input: NewHabit): Habit {
  const order = state.habits.reduce((max, h) => Math.max(max, h.order), -1) + 1;

  const habit: Habit = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    emoji: input.emoji || "✅",
    // Cycle through the palette so consecutive habits look distinct.
    color: input.color ?? HABIT_COLORS[order % HABIT_COLORS.length],
    cadence: input.cadence ?? { kind: "daily" },
    target: Math.max(1, input.target ?? 1),
    order,
    createdAt: today(),
    archivedAt: null,
    updatedAt: Date.now(),
    deletedAt: null,
  };

  state = { ...state, habits: [...state.habits, habit] };
  emit();

  persist(() => db.putHabit(habit));
  // Only worth asking once the user has something to lose.
  if (state.habits.length === 1) persist(() => db.requestPersistence());

  return habit;
}

export function updateHabit(
  id: string,
  patch: Partial<Omit<Habit, "id">>,
): void {
  // `updatedAt` last, so a caller cannot accidentally pass a stamp that would
  // make this edit lose to the version already on the server.
  const habits = state.habits.map((h) =>
    h.id === id ? { ...h, ...patch, updatedAt: Date.now() } : h,
  );
  const updated = habits.find((h) => h.id === id);
  if (!updated) return;

  state = { ...state, habits };
  emit();
  persist(() => db.putHabit(updated));
}

/**
 * The entries travel in it because a tombstone tells the server to drop the
 * habit's history outright — after a delete this is the only copy anywhere.
 */
export type DeletedHabit = { habit: Habit; entries: Entry[] };

/**
 * Delete locally, leaving a tombstone for the other devices. Returns what was
 * removed so the caller can offer an undo (`lib/undo.ts`); ignoring the return
 * value is a complete delete.
 */
export function deleteHabit(id: string): DeletedHabit | null {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return null;

  const now = Date.now();
  const tombstone: Habit = { ...habit, deletedAt: now, updatedAt: now };

  const removed: Entry[] = [];
  const entries = new Map(state.entries);
  for (const [key, entry] of entries) {
    if (!key.startsWith(`${id}:`)) continue;
    removed.push(entry);
    entries.delete(key);
  }

  state = {
    ...state,
    habits: state.habits.filter((h) => h.id !== id),
    tombstones: [...state.tombstones, tombstone],
    entries,
  };
  emit();
  persist(() => db.deleteHabitRecord(tombstone));

  return { habit, entries: removed };
}

/**
 * Put deleted records back as a fresh edit. Re-stamping habit *and entries*
 * with now is the whole trick: under their original `updatedAt` they lose to
 * the tombstone the delete wrote and the next pull quietly re-deletes them.
 */
export function restore(deleted: DeletedHabit): void {
  const now = Date.now();
  const habit: Habit = { ...deleted.habit, deletedAt: null, updatedAt: now };
  const entries = deleted.entries.map((entry) => ({
    ...entry,
    updatedAt: now,
  }));

  const merged = new Map(state.entries);
  for (const entry of entries)
    merged.set(entryKey(entry.habitId, entry.date), entry);

  state = {
    ...state,
    habits: [...state.habits.filter((h) => h.id !== habit.id), habit].sort(
      (a, b) => a.order - b.order,
    ),
    tombstones: state.tombstones.filter((h) => h.id !== habit.id),
    entries: merged,
  };
  emit();

  // Separate object stores with no ordering between them, so issue both at once.
  persist(() => Promise.all([db.putHabit(habit), db.putEntries(entries)]));
}

export function moveHabit(id: string, direction: -1 | 1): void {
  const ordered = [...state.habits].sort((a, b) => a.order - b.order);
  const habit = ordered.find((h) => h.id === id);
  if (!habit) return;

  // Active and archived are separate lists, so a swap across the two would
  // look like the button did nothing.
  const isActive = (h: Habit) => h.archivedAt === null;
  const group = ordered.filter((h) => isActive(h) === isActive(habit));

  const index = group.indexOf(habit);
  const target = index + direction;
  if (target < 0 || target >= group.length) return;

  const [a, b] = [group[index], group[target]];
  const now = Date.now();
  const habits = ordered
    .map((h) =>
      h.id === a.id
        ? { ...h, order: b.order, updatedAt: now }
        : h.id === b.id
          ? { ...h, order: a.order, updatedAt: now }
          : h,
    )
    .sort((x, y) => x.order - y.order);

  state = { ...state, habits };
  emit();
  persist(() =>
    db.putHabits([
      habits.find((h) => h.id === a.id)!,
      habits.find((h) => h.id === b.id)!,
    ]),
  );
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  const settingsUpdatedAt = Date.now();
  state = { ...state, settings, settingsUpdatedAt };
  emit();
  persist(() => db.putSettings(settings, settingsUpdatedAt));
}

export function toggleFavourite(quoteId: string): void {
  const favourites = state.settings.favourites.includes(quoteId)
    ? state.settings.favourites.filter((id) => id !== quoteId)
    : [...state.settings.favourites, quoteId];
  updateSettings({ favourites });
}

/**
 * Tombstones are deliberately left out: a backup is what the user *has*, not a
 * log of what they discarded. Nothing is lost by it — a restored habit carries
 * its original `updatedAt`, so a later tombstone on the account still wins.
 */
export function exportBundle(): ExportBundle {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    entries: [...state.entries.values()],
    settings: state.settings,
  };
}

export type ImportMode = "merge" | "replace";

export function importBundle(bundle: AnyExportBundle, mode: ImportMode): void {
  if (bundle.version !== 1 && bundle.version !== 2) {
    throw new Error(
      `Unsupported backup version: ${(bundle as { version: number }).version}`,
    );
  }

  // v1 files predate sync and carry no `updatedAt`/`deletedAt`; `normaliseHabit`
  // supplies both without letting an old record outrank a newer edit.
  const incomingHabits = bundle.habits.map(normaliseHabit);

  let habits: Habit[];
  let entries: Map<string, Entry>;

  if (mode === "replace") {
    habits = incomingHabits;
    entries = new Map(
      bundle.entries.map((e) => [entryKey(e.habitId, e.date), e]),
    );
  } else {
    const byId = new Map(state.habits.map((h) => [h.id, h]));
    for (const habit of incomingHabits)
      if (!byId.has(habit.id)) byId.set(habit.id, habit);
    habits = [...byId.values()];

    entries = new Map(state.entries);
    for (const incoming of bundle.entries) {
      const key = entryKey(incoming.habitId, incoming.date);
      const existing = entries.get(key);
      // Last write wins — the same rule `lib/sync/merge.ts` applies.
      if (!existing || incoming.updatedAt > existing.updatedAt)
        entries.set(key, incoming);
    }
  }

  // Only the renumbered habits get a fresh stamp; the rest keep theirs, which
  // stops an old backup outranking newer server data.
  const now = Date.now();
  habits = habits
    .sort((a, b) => a.order - b.order)
    .map((h, i) => (h.order === i ? h : { ...h, order: i, updatedAt: now }));

  const replacing = mode === "replace";
  const settings = replacing
    ? { ...DEFAULT_SETTINGS, ...bundle.settings }
    : state.settings;
  const settingsUpdatedAt = replacing ? now : state.settingsUpdatedAt;

  state = {
    ...state,
    hydrated: true,
    habits,
    entries,
    settings,
    settingsUpdatedAt,
    // A replace drops held tombstones, else the restore re-deletes what it
    // was meant to bring back.
    tombstones: replacing ? [] : state.tombstones,
  };
  emit();

  persist(async () => {
    if (replacing) {
      await db.replaceAll({
        habits,
        entries: [...entries.values()],
        settings: { value: settings, updatedAt: settingsUpdatedAt },
        sync: state.sync,
      });
      return;
    }
    await db.putHabits(habits);
    await db.putEntries([...entries.values()]);
    await db.putSettings(settings, settingsUpdatedAt);
  });
}

// The dependency runs one way: sync imports the store, never the reverse.

/** The store's contents in the shape `lib/sync/merge.ts` expects. */
export function localSnapshot(): LocalSnapshot {
  return {
    // Recombined: the merge rules need tombstones, even though no screen does.
    habits: [...state.habits, ...state.tombstones],
    entries: state.entries,
    settings: { value: state.settings, updatedAt: state.settingsUpdatedAt },
  };
}

export function syncMeta(): db.SyncMeta {
  return state.sync;
}

export function setSyncStatus(syncStatus: SyncStatus): void {
  if (state.syncStatus.kind === syncStatus.kind) {
    // Re-rendering for an identical status is pure cost.
    if (syncStatus.kind !== "error") return;
    if (
      (state.syncStatus as { message: string }).message === syncStatus.message
    )
      return;
  }
  state = { ...state, syncStatus };
  emit();
}

export function saveSyncMeta(meta: db.SyncMeta): void {
  state = { ...state, sync: meta };
  emit();
  persist(() => db.putSyncMeta(meta));
}

/**
 * Adopt a merged pull. Memory first, disk after (§7.2): a failed write re-pulls
 * the same payload, which the merge absorbs, where a cursor ahead of its data
 * loses records — hence `db.applyMerge`'s single transaction.
 */
export function applyPulled(merged: MergeResult, meta: db.SyncMeta): void {
  const { snapshot } = merged;
  const live = snapshot.habits.filter((h) => h.deletedAt === null);
  const tombstones = snapshot.habits.filter((h) => h.deletedAt !== null);

  state = {
    ...state,
    habits: live,
    tombstones,
    entries: snapshot.entries,
    settings: snapshot.settings.value,
    settingsUpdatedAt: snapshot.settings.updatedAt,
    sync: meta,
  };
  emit();

  persist(() =>
    db.applyMerge({
      habits: merged.changedHabits,
      entries: merged.changedEntries,
      purgedHabitIds: merged.purgedHabitIds,
      settings: merged.settingsChanged ? snapshot.settings : null,
      sync: meta,
    }),
  );
}

/**
 * Hand the device to a different account. Emptied and reset rather than merged,
 * so neither two people's habits mix nor the old data pushes under the new id.
 */
export function adoptAccount(accountId: string | null): void {
  const meta: db.SyncMeta = { ...db.NO_SYNC, accountId };

  state = {
    ...state,
    habits: [],
    tombstones: [],
    entries: new Map(),
    settings: DEFAULT_SETTINGS,
    settingsUpdatedAt: 0,
    sync: meta,
  };
  emit();

  persist(() =>
    db.replaceAll({ habits: [], entries: [], settings: null, sync: meta }),
  );
}

/**
 * Delete everything here — and, if signed in, everywhere else. Habits become
 * tombstones rather than vanishing, because on a synced account a local-only
 * wipe is undone by the next pull.
 */
export function resetEverything(): void {
  const now = Date.now();
  const tombstones = [
    ...state.tombstones,
    ...state.habits.map((h) => ({ ...h, deletedAt: now, updatedAt: now })),
  ];

  state = {
    ...state,
    hydrated: true,
    habits: [],
    entries: new Map(),
    settings: DEFAULT_SETTINGS,
    settingsUpdatedAt: now,
    tombstones,
  };
  emit();

  persist(() =>
    db.replaceAll({
      habits: tombstones,
      entries: [],
      settings: { value: DEFAULT_SETTINGS, updatedAt: now },
      sync: state.sync,
    }),
  );
}
