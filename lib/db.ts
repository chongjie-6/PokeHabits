/**
 * IndexedDB persistence. See DESIGN.md §7.3. Dependency-free: the surface
 * needed is small enough that a wrapper would cost more in supply chain than
 * it saves. Stores: `habits` by id, `entries` by the compound key from §3,
 * `kv` for settings and other singletons.
 */

import {
  DEFAULT_SETTINGS,
  normaliseHabit,
  type Entry,
  type Habit,
  type Settings,
} from "./types";

/** Pre-rebrand name, kept: a rename orphans every existing install's habits. */
const DB_NAME = "hapi";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const from = event.oldVersion;

      // Migrations are keyed on the previous version and must be additive.
      if (from < 1) {
        db.createObjectStore("habits", { keyPath: "id" });
        db.createObjectStore("entries", { keyPath: ["habitId", "date"] });
        db.createObjectStore("kv", { keyPath: "key" });
      }

      if (from < 2) {
        // `request.transaction` is the upgrade transaction; the writes below
        // belong to it and commit with the version change or not at all.
        backfillSyncMetadata(request.transaction!);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // An open connection blocks another tab's upgrade for as long as this tab
      // lives. The next write here reopens, at the new version.
      db.onversionchange = () => {
        db.close();
        if (dbPromise === opening) dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("OpenHabits database blocked by another open tab"));
  });

  // A failed open is not cached, or one blocked upgrade fails every later write.
  const opening = dbPromise;
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });

  return opening;
}

/**
 * Habits get `updatedAt` from their creation day, not the clock, so a stale
 * local copy cannot outrank later server edits. Settings get the clock, having
 * no creation date — a fair outcome for a blob, not for a year of history.
 */
function backfillSyncMetadata(transaction: IDBTransaction): void {
  const cursorRequest = transaction.objectStore("habits").openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.update(normaliseHabit(cursor.value));
    cursor.continue();
  };

  const kv = transaction.objectStore("kv");
  const settingsRequest = kv.get("settings");
  settingsRequest.onsuccess = () => {
    const row = settingsRequest.result;
    if (row && row.updatedAt === undefined) {
      kv.put({ ...row, updatedAt: Date.now() });
    }
  };
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

export type Snapshot = {
  habits: Habit[];
  /**
   * Kept so sync can tell peers, and handed back separately because one
   * forgotten filter would put a deleted habit back on the Today list.
   */
  tombstones: Habit[];
  entries: Entry[];
  settings: Settings;
  settingsUpdatedAt: number;
  sync: SyncMeta;
};

/**
 * `cursor` is the server's `seq`, `pushedThrough` a local `updatedAt`
 * watermark: different clocks, never to be compared. See `sync/protocol.ts`.
 */
export type SyncMeta = {
  cursor: number;
  pushedThrough: number;
  lastSyncAt: number;
  /** Account the local data belongs to; a change means the store must be reset. */
  accountId: string | null;
};

export const NO_SYNC: SyncMeta = {
  cursor: 0,
  pushedThrough: 0,
  lastSyncAt: 0,
  accountId: null,
};

export async function loadAll(): Promise<Snapshot> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readonly");

  const [habits, entries, settingsRow, syncRow] = await Promise.all([
    promisify<Habit[]>(t.objectStore("habits").getAll()),
    promisify<Entry[]>(t.objectStore("entries").getAll()),
    promisify<{ key: string; value: Settings; updatedAt?: number } | undefined>(
      t.objectStore("kv").get("settings"),
    ),
    promisify<{ key: string; value: SyncMeta } | undefined>(
      t.objectStore("kv").get("sync"),
    ),
  ]);

  const live = habits.filter((h) => h.deletedAt === null);
  const tombstones = habits.filter((h) => h.deletedAt !== null);

  return {
    habits: live.sort((a, b) => a.order - b.order),
    tombstones,
    // A tombstone's entries were removed when it was written.
    entries,
    settings: readSettings(settingsRow?.value),
    settingsUpdatedAt: settingsRow?.updatedAt ?? 0,
    sync: { ...NO_SYNC, ...(syncRow?.value ?? {}) },
  };
}

/**
 * Field by field, not a spread back: a new field must not arrive undefined, and
 * a field this release no longer has must not ride along — `theme` left the
 * blob in §13.8 #1, and a stale copy would otherwise be pushed on the next sync.
 */
function readSettings(stored: unknown): Settings {
  const value = (stored ?? {}) as Partial<Settings>;
  return {
    weekStartsOn: value.weekStartsOn ?? DEFAULT_SETTINGS.weekStartsOn,
    dayStartHour: value.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour,
    reminderHour: value.reminderHour ?? DEFAULT_SETTINGS.reminderHour,
    // `?? null` rather than the default: null is "off" and has to survive.
    eveningReminderHour: value.eveningReminderHour ?? null,
    haptics: value.haptics ?? DEFAULT_SETTINGS.haptics,
    dailyMode: value.dailyMode ?? DEFAULT_SETTINGS.dailyMode,
    favourites: value.favourites ?? DEFAULT_SETTINGS.favourites,
    dailyTags: value.dailyTags ?? DEFAULT_SETTINGS.dailyTags,
  };
}

export async function putHabit(habit: Habit): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["habits"], "readwrite").objectStore("habits").put(habit),
  );
}

export async function putHabits(habits: Habit[]): Promise<void> {
  const db = await openDb();
  const store = tx(db, ["habits"], "readwrite").objectStore("habits");
  await Promise.all(habits.map((h) => promisify(store.put(h))));
}

/**
 * A tombstone rather than a removed row: on a replicated store a missing row is
 * indistinguishable from an unseen one, so a hard delete is re-learned.
 */
export async function deleteHabitRecord(habit: Habit): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries"], "readwrite");

  // A transaction auto-commits once its queue drains, so awaiting the first
  // request would close it before the second was queued.
  const wrote = promisify(t.objectStore("habits").put(habit));
  // The compound key makes a bounded range a delete without a full scan.
  const cleared = promisify(
    t
      .objectStore("entries")
      .delete(IDBKeyRange.bound([habit.id, ""], [habit.id, "￿"])),
  );

  await Promise.all([wrote, cleared]);
}

/**
 * The one place a habit is genuinely removed rather than tombstoned, reached
 * only by the collector in `lib/store.ts` — see `TOMBSTONE_TTL_MS`.
 */
export async function forgetHabits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const db = await openDb();
  const store = tx(db, ["habits"], "readwrite").objectStore("habits");
  await Promise.all(ids.map((id) => promisify(store.delete(id))));
}

export async function putEntry(entry: Entry): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["entries"], "readwrite").objectStore("entries").put(entry),
  );
}

export async function putEntries(entries: Entry[]): Promise<void> {
  const db = await openDb();
  const store = tx(db, ["entries"], "readwrite").objectStore("entries");
  await Promise.all(entries.map((e) => promisify(store.put(e))));
}

export async function putSettings(
  settings: Settings,
  updatedAt: number,
): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["kv"], "readwrite")
      .objectStore("kv")
      .put({ key: "settings", value: settings, updatedAt }),
  );
}

export async function putSyncMeta(meta: SyncMeta): Promise<void> {
  const db = await openDb();
  await promisify(
    tx(db, ["kv"], "readwrite")
      .objectStore("kv")
      .put({ key: "sync", value: meta }),
  );
}

/**
 * One transaction: a failure re-fetches the payload, where a partial commit
 * under a saved cursor leaves a hole no later sync would think to fill.
 */
export async function applyMerge(input: {
  habits: Habit[];
  entries: Entry[];
  purgedHabitIds: string[];
  settings: { value: Settings; updatedAt: number } | null;
  sync: SyncMeta;
}): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readwrite");

  const habitStore = t.objectStore("habits");
  const entryStore = t.objectStore("entries");
  const kv = t.objectStore("kv");

  const pending: Promise<unknown>[] = [];
  for (const habit of input.habits)
    pending.push(promisify(habitStore.put(habit)));
  for (const id of input.purgedHabitIds) {
    pending.push(
      promisify(entryStore.delete(IDBKeyRange.bound([id, ""], [id, "￿"]))),
    );
  }
  // After the purge, so an entry for a habit deleted in the same payload is
  // not reinstated by request ordering.
  for (const entry of input.entries)
    pending.push(promisify(entryStore.put(entry)));
  if (input.settings) {
    pending.push(
      promisify(
        kv.put({
          key: "settings",
          value: input.settings.value,
          updatedAt: input.settings.updatedAt,
        }),
      ),
    );
  }
  pending.push(promisify(kv.put({ key: "sync", value: input.sync })));

  await Promise.all(pending);
}

/**
 * The wipe and the writes commit together or not at all. Split in two, a tab
 * closed between them leaves the device empty: an import loses both copies,
 * and a wipe loses the tombstones that stop the next pull undoing it.
 */
export async function replaceAll(input: {
  habits: Habit[];
  entries: Entry[];
  settings: { value: Settings; updatedAt: number } | null;
  sync: SyncMeta;
}): Promise<void> {
  const db = await openDb();
  const t = tx(db, ["habits", "entries", "kv"], "readwrite");
  const habitStore = t.objectStore("habits");
  const entryStore = t.objectStore("entries");
  const kv = t.objectStore("kv");

  // Requests run in issue order, so the clears land before the puts.
  const pending: Promise<unknown>[] = [
    promisify(habitStore.clear()),
    promisify(entryStore.clear()),
    promisify(kv.clear()),
  ];
  for (const habit of input.habits)
    pending.push(promisify(habitStore.put(habit)));
  for (const entry of input.entries)
    pending.push(promisify(entryStore.put(entry)));
  if (input.settings) {
    pending.push(
      promisify(
        kv.put({
          key: "settings",
          value: input.settings.value,
          updatedAt: input.settings.updatedAt,
        }),
      ),
    );
  }
  pending.push(promisify(kv.put({ key: "sync", value: input.sync })));

  await Promise.all(pending);
}

/** Without it, a year of streaks can be reclaimed under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist)
    return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
