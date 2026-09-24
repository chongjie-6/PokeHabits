/**
 * The client store — every mutation the app has. `lib/store.ts` is the file
 * most able to lose a year of habits: five of its functions rewrite the whole
 * snapshot, and three clear IndexedDB on the way past. Driven through its
 * exported functions rather than React, so each case re-imports the module for
 * a fresh store and stands a fake in for `lib/db.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  entryKey,
  type Entry,
  type Habit,
  type Settings,
} from "@/lib/types";
import type { Snapshot, SyncMeta } from "@/lib/db";
import { TOMBSTONE_TTL_MS } from "@/lib/sync/protocol";

const NO_SYNC: SyncMeta = {
  cursor: 0,
  pushedThrough: 0,
  lastSyncAt: 0,
  accountId: null,
};

/** `vi.mock` is hoisted above the imports, so its state hoists with it. */
const fake = vi.hoisted(() => ({
  snapshot: null as unknown,
  loadFails: false,
  writes: [] as { fn: string; args: unknown[] }[],
}));

vi.mock("@/lib/db", () => {
  const record =
    (fn: string) =>
    (...args: unknown[]) => {
      fake.writes.push({ fn, args });
      return Promise.resolve();
    };

  return {
    NO_SYNC: { cursor: 0, pushedThrough: 0, lastSyncAt: 0, accountId: null },
    loadAll: () =>
      fake.loadFails
        ? Promise.reject(new Error("IndexedDB unavailable"))
        : Promise.resolve(fake.snapshot),
    putHabit: record("putHabit"),
    putHabits: record("putHabits"),
    putEntry: record("putEntry"),
    putEntries: record("putEntries"),
    putSettings: record("putSettings"),
    putSyncMeta: record("putSyncMeta"),
    deleteHabitRecord: record("deleteHabitRecord"),
    forgetHabits: record("forgetHabits"),
    applyMerge: record("applyMerge"),
    replaceAll: record("replaceAll"),
    requestPersistence: record("requestPersistence"),
  };
});

type Store = typeof import("@/lib/store");

function habit(id: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence: { kind: "daily" },
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt: 1_000,
    deletedAt: null,
    ...over,
  };
}

function entry(
  habitId: string,
  date: string,
  count: number,
  updatedAt: number,
): Entry {
  return { habitId, date, count, updatedAt };
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    habits: [],
    tombstones: [],
    entries: [],
    settings: DEFAULT_SETTINGS,
    settingsUpdatedAt: 0,
    sync: NO_SYNC,
    ...over,
  };
}

/** A fresh module instance, so the module-level state starts empty every time. */
async function load(from: Snapshot | null = null): Promise<Store> {
  fake.snapshot = from ?? snapshot();
  vi.resetModules();
  const store: Store = await import("@/lib/store");
  if (from !== null) await store.hydrate();
  return store;
}

function wrote(fn: string): { fn: string; args: unknown[] }[] {
  return fake.writes.filter((write) => write.fn === fn);
}

beforeEach(() => {
  fake.writes = [];
  fake.loadFails = false;
});

describe("hydrate", () => {
  it("reads the snapshot into memory, keyed and sorted", async () => {
    const store = await load(
      snapshot({
        habits: [habit("b", { order: 1 }), habit("a", { order: 0 })],
        entries: [entry("a", "2026-08-01", 2, 5)],
        settingsUpdatedAt: 77,
      }),
    );

    const state = store.currentState();
    expect(state.hydrated).toBe(true);
    expect(state.habits.map((h) => h.id)).toEqual(["b", "a"]);
    expect(state.entries.get(entryKey("a", "2026-08-01"))?.count).toBe(2);
    expect(state.settingsUpdatedAt).toBe(77);
  });

  it("runs in memory when the database will not open", async () => {
    fake.loadFails = true;
    fake.snapshot = snapshot();
    vi.resetModules();
    const store: Store = await import("@/lib/store");
    const noise = vi.spyOn(console, "error").mockImplementation(() => {});

    await store.hydrate();

    // Private-mode Safari and similar: the user loses persistence, not the app.
    expect(store.currentState().hydrated).toBe(true);
    expect(noise).toHaveBeenCalled();
    noise.mockRestore();
  });

  it("collects tombstones no device could still need, and keeps the rest", async () => {
    const stale = Date.now() - TOMBSTONE_TTL_MS - 1;
    const recent = Date.now() - 1000;
    const store = await load(
      snapshot({
        tombstones: [
          habit("old", { deletedAt: stale, updatedAt: stale }),
          habit("new", { deletedAt: recent, updatedAt: recent }),
        ],
      }),
    );

    expect(store.currentState().tombstones.map((h) => h.id)).toEqual(["new"]);
    expect(wrote("forgetHabits")[0].args[0]).toEqual(["old"]);
  });

  it("writes nothing when every tombstone is still inside the window", async () => {
    const recent = Date.now() - 1000;
    await load(snapshot({ tombstones: [habit("new", { deletedAt: recent })] }));
    expect(wrote("forgetHabits")).toHaveLength(0);
  });
});

describe("ticking", () => {
  it("advances 0 → target → 0", async () => {
    const store = await load(snapshot({ habits: [habit("a", { target: 2 })] }));
    const day = store.today();

    store.toggleEntry("a", day);
    expect(store.countFor("a", day)).toBe(1);
    store.toggleEntry("a", day);
    expect(store.countFor("a", day)).toBe(2);
    // Past the target it wraps rather than climbing.
    store.toggleEntry("a", day);
    expect(store.countFor("a", day)).toBe(0);
  });

  it("ignores a habit that is not there", async () => {
    const store = await load(snapshot());
    store.toggleEntry("ghost", store.today());
    expect(wrote("putEntry")).toHaveLength(0);
  });

  it("buzzes on a tick and on completion, but not on the wrap to zero", async () => {
    const buzz = vi.fn();
    vi.stubGlobal("navigator", { vibrate: buzz });

    const store = await load(snapshot({ habits: [habit("a", { target: 2 })] }));
    const day = store.today();

    store.toggleEntry("a", day);
    store.toggleEntry("a", day);
    store.toggleEntry("a", day);

    // A step, then completion. The third call is a correction, and confirming a
    // correction feels like having recorded something.
    expect(buzz.mock.calls.map(([pattern]) => pattern)).toEqual([
      12,
      [12, 45, 26],
    ]);
    vi.unstubAllGlobals();
  });

  it("stays silent when haptics are off", async () => {
    const buzz = vi.fn();
    vi.stubGlobal("navigator", { vibrate: buzz });

    const settings: Settings = { ...DEFAULT_SETTINGS, haptics: false };
    const store = await load(snapshot({ habits: [habit("a")], settings }));
    store.toggleEntry("a", store.today());

    expect(buzz).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("never records a negative count", async () => {
    const store = await load(snapshot({ habits: [habit("a")] }));
    store.setCount("a", "2026-08-01", -5);
    expect(store.countFor("a", "2026-08-01")).toBe(0);
  });
});

describe("moveHabit", () => {
  it("swaps with the neighbour in the same group", async () => {
    const store = await load(
      snapshot({
        habits: [
          habit("a", { order: 0 }),
          habit("b", { order: 1 }),
          habit("c", { order: 2 }),
        ],
      }),
    );

    store.moveHabit("c", -1);
    expect(store.currentState().habits.map((h) => h.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("steps over an archived habit rather than swapping with it", async () => {
    // Active and archived are shown as separate lists, so trading places with an
    // archived neighbour would look like the button had done nothing.
    const store = await load(
      snapshot({
        habits: [
          habit("a", { order: 0 }),
          habit("gone", { order: 1, archivedAt: "2026-08-02" }),
          habit("b", { order: 2 }),
        ],
      }),
    );

    store.moveHabit("b", -1);
    const live = store
      .currentState()
      .habits.filter((h) => h.archivedAt === null);
    expect(live.map((h) => h.id)).toEqual(["b", "a"]);
  });

  it("does nothing at either end", async () => {
    const store = await load(snapshot({ habits: [habit("a", { order: 0 })] }));
    store.moveHabit("a", -1);
    store.moveHabit("a", 1);
    expect(wrote("putHabits")).toHaveLength(0);
  });
});

describe("deleteHabit", () => {
  it("leaves a tombstone and drops the habit's entries", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a"), habit("b", { order: 1 })],
        entries: [
          entry("a", "2026-08-01", 1, 5),
          entry("b", "2026-08-01", 1, 5),
        ],
      }),
    );

    store.deleteHabit("a");
    const state = store.currentState();

    expect(state.habits.map((h) => h.id)).toEqual(["b"]);
    expect(state.tombstones.map((h) => h.id)).toEqual(["a"]);
    expect(state.tombstones[0].deletedAt).not.toBeNull();
    // b's history is untouched; a's is gone.
    expect([...state.entries.keys()]).toEqual([entryKey("b", "2026-08-01")]);
  });

  it("hands back the habit and its entries, which nothing else still holds", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [
          entry("a", "2026-08-01", 1, 5),
          entry("a", "2026-08-02", 1, 6),
        ],
      }),
    );

    const deleted = store.deleteHabit("a");

    expect(deleted?.habit.id).toBe("a");
    expect(deleted?.entries.map((e) => e.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
    // The tombstone the peers get, not the record handed back for undo.
    expect(deleted?.habit.deletedAt).toBeNull();
  });

  it("returns null for a habit that is not there", async () => {
    const store = await load(snapshot());
    expect(store.deleteHabit("ghost")).toBeNull();
  });
});

describe("restore", () => {
  it("puts the habit and its entries back and drops the tombstone", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a"), habit("b", { order: 1 })],
        entries: [entry("a", "2026-08-01", 1, 5)],
      }),
    );

    const deleted = store.deleteHabit("a")!;
    store.restore(deleted);
    const state = store.currentState();

    expect(state.habits.map((h) => h.id)).toEqual(["a", "b"]);
    expect(state.tombstones).toEqual([]);
    expect(state.entries.get(entryKey("a", "2026-08-01"))?.count).toBe(1);
  });

  it("re-stamps everything, so the restore outranks the tombstone it undoes", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 1, 5)],
      }),
    );

    const deleted = store.deleteHabit("a")!;
    const deletedAt = store.currentState().tombstones[0].updatedAt;
    store.restore(deleted);
    const state = store.currentState();

    // Without this the next pull applies the tombstone and re-deletes it.
    expect(state.habits[0].updatedAt).toBeGreaterThanOrEqual(deletedAt);
    expect(state.habits[0].deletedAt).toBeNull();
    // The entries too: the server dropped them when the tombstone landed, so
    // they only exist again if they are pushed again.
    expect(
      state.entries.get(entryKey("a", "2026-08-01"))!.updatedAt,
    ).toBeGreaterThan(5);
  });

  it("writes the habit and its entries back to storage", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 1, 5)],
      }),
    );

    store.restore(store.deleteHabit("a")!);

    expect(wrote("putHabit")).toHaveLength(1);
    expect(
      (wrote("putEntries")[0].args[0] as Entry[]).map((e) => e.date),
    ).toEqual(["2026-08-01"]);
  });

  it("restores a habit with no history at all", async () => {
    const store = await load(snapshot({ habits: [habit("a")] }));

    store.restore(store.deleteHabit("a")!);

    expect(store.currentState().habits.map((h) => h.id)).toEqual(["a"]);
    expect(store.currentState().entries.size).toBe(0);
  });
});

describe("exportBundle", () => {
  it("carries what the user has, not what they discarded", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        tombstones: [habit("dead", { deletedAt: 9 })],
      }),
    );

    const bundle = store.exportBundle();
    expect(bundle.version).toBe(2);
    expect(bundle.habits.map((h) => h.id)).toEqual(["a"]);
  });
});

describe("importBundle, merging", () => {
  it("keeps what is here and adds what is not", async () => {
    const store = await load(
      snapshot({ habits: [habit("mine", { name: "kept" })] }),
    );

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [
          habit("mine", { name: "from the file" }),
          habit("theirs", { order: 1 }),
        ],
        entries: [],
        settings: DEFAULT_SETTINGS,
      },
      "merge",
    );

    const habits = store.currentState().habits;
    expect(habits.map((h) => h.id).sort()).toEqual(["mine", "theirs"]);
    // A habit already here is not overwritten by the backup's copy of it.
    expect(habits.find((h) => h.id === "mine")?.name).toBe("kept");
  });

  it("resolves a day both copies have by last write", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 1, 100)],
      }),
    );

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [habit("a")],
        entries: [
          entry("a", "2026-08-01", 9, 200),
          entry("a", "2026-08-02", 3, 50),
        ],
        settings: DEFAULT_SETTINGS,
      },
      "merge",
    );

    expect(store.countFor("a", "2026-08-01")).toBe(9);
    expect(store.countFor("a", "2026-08-02")).toBe(3);
  });

  it("does not let an older backup win a day the device has since changed", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 4, 900)],
      }),
    );

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 1, 100)],
        settings: DEFAULT_SETTINGS,
      },
      "merge",
    );

    expect(store.countFor("a", "2026-08-01")).toBe(4);
  });

  it("keeps this device's settings and tombstones", async () => {
    const mine: Settings = { ...DEFAULT_SETTINGS, dayStartHour: 4 };
    const store = await load(
      snapshot({
        settings: mine,
        tombstones: [habit("dead", { deletedAt: Date.now() })],
      }),
    );

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [],
        entries: [],
        settings: { ...DEFAULT_SETTINGS, dayStartHour: 0 },
      },
      "merge",
    );

    expect(store.currentState().settings.dayStartHour).toBe(4);
    expect(store.currentState().tombstones.map((h) => h.id)).toEqual(["dead"]);
    expect(wrote("replaceAll")).toHaveLength(0);
  });

  it("fills in the metadata a v1 file could not have carried", async () => {
    const store = await load(snapshot());

    store.importBundle(
      {
        version: 1,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [
          {
            id: "old",
            name: "old",
            emoji: "✅",
            color: "green",
            cadence: { kind: "daily" },
            target: 1,
            order: 0,
            createdAt: "2020-01-01",
            archivedAt: null,
          },
        ],
        entries: [],
        settings: DEFAULT_SETTINGS,
      },
      "merge",
    );

    const restored = store.currentState().habits[0];
    expect(restored.deletedAt).toBeNull();
    // The creation day, not the clock — a stale backup must not outrank edits
    // already on the server.
    expect(restored.updatedAt).toBe(Date.parse("2020-01-01T00:00:00Z"));
  });

  it("refuses a version it does not understand", async () => {
    const store = await load(snapshot());
    expect(() =>
      store.importBundle(
        { version: 99 } as unknown as Parameters<Store["importBundle"]>[0],
        "merge",
      ),
    ).toThrow(/Unsupported backup version/);
  });

  it("renumbers only the habits whose position actually moved", async () => {
    const store = await load(snapshot());

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [
          habit("a", { order: 0, updatedAt: 5 }),
          habit("b", { order: 7, updatedAt: 5 }),
        ],
        entries: [],
        settings: DEFAULT_SETTINGS,
      },
      "merge",
    );

    const [a, b] = store.currentState().habits;
    expect([a.order, b.order]).toEqual([0, 1]);
    // `a` was already in place, so it keeps the stamp it came with; `b` moved,
    // which is a genuine local edit.
    expect(a.updatedAt).toBe(5);
    expect(b.updatedAt).toBeGreaterThan(5);
  });
});

describe("importBundle, replacing", () => {
  it("wipes the device first and takes the file's settings", async () => {
    const store = await load(
      snapshot({
        habits: [habit("mine")],
        entries: [entry("mine", "2026-08-01", 1, 5)],
        settings: { ...DEFAULT_SETTINGS, dayStartHour: 4 },
        tombstones: [habit("dead", { deletedAt: Date.now() })],
      }),
    );

    store.importBundle(
      {
        version: 2,
        exportedAt: "2026-09-01T00:00:00.000Z",
        habits: [habit("theirs")],
        entries: [entry("theirs", "2026-08-05", 2, 50)],
        settings: { ...DEFAULT_SETTINGS, weekStartsOn: 0 },
      },
      "replace",
    );

    const state = store.currentState();
    expect(state.habits.map((h) => h.id)).toEqual(["theirs"]);
    expect([...state.entries.keys()]).toEqual([
      entryKey("theirs", "2026-08-05"),
    ]);
    expect(state.settings.weekStartsOn).toBe(0);
    // A restore that silently re-deleted the habits it brought back would be
    // worse than losing tombstones a peer may not have seen.
    expect(state.tombstones).toEqual([]);
    expect(wrote("replaceAll")).toHaveLength(1);
  });
});

describe("applyPulled", () => {
  it("splits the merged snapshot into live habits and tombstones", async () => {
    const store = await load(snapshot());
    const meta: SyncMeta = {
      cursor: 42,
      pushedThrough: 7,
      lastSyncAt: 1,
      accountId: "alice",
    };

    store.applyPulled(
      {
        snapshot: {
          habits: [habit("live"), habit("dead", { deletedAt: 500 })],
          entries: new Map([
            [entryKey("live", "2026-08-01"), entry("live", "2026-08-01", 1, 5)],
          ]),
          settings: { value: DEFAULT_SETTINGS, updatedAt: 9 },
        },
        changedHabits: [],
        changedEntries: [],
        settingsChanged: false,
        purgedHabitIds: [],
      },
      meta,
    );

    const state = store.currentState();
    expect(state.habits.map((h) => h.id)).toEqual(["live"]);
    expect(state.tombstones.map((h) => h.id)).toEqual(["dead"]);
    expect(state.sync).toEqual(meta);
    expect(wrote("applyMerge")).toHaveLength(1);
  });
});

describe("adoptAccount", () => {
  it("empties the device so the new account starts from its own server state", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        entries: [entry("a", "2026-08-01", 1, 5)],
        settings: { ...DEFAULT_SETTINGS, dayStartHour: 4 },
        sync: {
          cursor: 9,
          pushedThrough: 9,
          lastSyncAt: 9,
          accountId: "alice",
        },
      }),
    );

    store.adoptAccount("bob");

    const state = store.currentState();
    expect(state.habits).toEqual([]);
    expect(state.entries.size).toBe(0);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    // Reset, not merely re-pointed: bob's history arrives as a first sync.
    expect(state.sync).toEqual({ ...NO_SYNC, accountId: "bob" });
    expect(wrote("replaceAll")).toHaveLength(1);
  });

  it("leaves no tombstones behind for the next account to push", async () => {
    const store = await load(
      snapshot({ tombstones: [habit("dead", { deletedAt: Date.now() })] }),
    );
    store.adoptAccount(null);
    expect(store.currentState().tombstones).toEqual([]);
  });
});

describe("resetEverything", () => {
  it("tombstones the habits rather than dropping them", async () => {
    const store = await load(
      snapshot({ habits: [habit("a"), habit("b", { order: 1 })] }),
    );

    store.resetEverything();
    const state = store.currentState();

    expect(state.habits).toEqual([]);
    // On a synced account a local-only wipe is undone by the next pull, so the
    // button would appear to work and then put a year of data back.
    expect(state.tombstones.map((h) => h.id).sort()).toEqual(["a", "b"]);
    expect(state.tombstones.every((h) => h.deletedAt !== null)).toBe(true);

    // The wipe and the tombstones in one write: a wipe that commits without
    // them is undone by the next pull.
    const writes = wrote("replaceAll");
    expect(writes).toHaveLength(1);
    const { habits } = writes[0].args[0] as { habits: Habit[] };
    expect(habits.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps a tombstone that was already there", async () => {
    // Recent, or `hydrate` collects it before this test gets to look.
    const store = await load(
      snapshot({
        habits: [habit("a")],
        tombstones: [habit("old", { deletedAt: Date.now() })],
      }),
    );
    store.resetEverything();
    expect(
      store
        .currentState()
        .tombstones.map((h) => h.id)
        .sort(),
    ).toEqual(["a", "old"]);
  });
});

describe("localSnapshot", () => {
  it("hands the merge layer the tombstones no screen ever sees", async () => {
    const store = await load(
      snapshot({
        habits: [habit("a")],
        tombstones: [habit("dead", { deletedAt: Date.now() })],
      }),
    );

    expect(
      store
        .localSnapshot()
        .habits.map((h) => h.id)
        .sort(),
    ).toEqual(["a", "dead"]);
  });
});
