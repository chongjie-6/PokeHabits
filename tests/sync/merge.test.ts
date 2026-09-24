import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  entryKey,
  type Entry,
  type Habit,
} from "@/lib/types";
import {
  collectPush,
  mergeIncoming,
  watermarkAfterPush,
  type LocalSnapshot,
} from "@/lib/sync/merge";

function habit(
  id: string,
  updatedAt: number,
  over: Partial<Habit> = {},
): Habit {
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
    updatedAt,
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

function snapshot(
  habits: Habit[],
  entries: Entry[],
  settingsUpdatedAt = 0,
): LocalSnapshot {
  return {
    habits,
    entries: new Map(entries.map((e) => [entryKey(e.habitId, e.date), e])),
    settings: { value: DEFAULT_SETTINGS, updatedAt: settingsUpdatedAt },
  };
}

const NOTHING = { habits: [], entries: [], settings: null };

describe("mergeIncoming", () => {
  it("takes the later write and ignores the earlier one", () => {
    const local = snapshot(
      [habit("a", 100)],
      [entry("a", "2026-08-01", 1, 100)],
    );

    const result = mergeIncoming(local, {
      ...NOTHING,
      entries: [entry("a", "2026-08-01", 5, 200)],
    });

    expect(result.snapshot.entries.get("a:2026-08-01")?.count).toBe(5);
    expect(result.changedEntries).toHaveLength(1);
  });

  it("adds an incoming entry on a day it has never seen, however old the stamp", () => {
    // An absent local row is not a competing write, so age is irrelevant.
    const local = snapshot(
      [habit("a", 100)],
      [entry("a", "2026-08-01", 1, 999)],
    );

    const result = mergeIncoming(local, {
      ...NOTHING,
      entries: [entry("a", "2026-08-02", 9, 50)],
    });

    expect(result.snapshot.entries.get("a:2026-08-02")?.count).toBe(9);
  });

  it("keeps an older local write when the server is behind", () => {
    const local = snapshot(
      [habit("a", 100)],
      [entry("a", "2026-08-01", 7, 300)],
    );

    const result = mergeIncoming(local, {
      ...NOTHING,
      entries: [entry("a", "2026-08-01", 1, 200)],
    });

    expect(result.snapshot.entries.get("a:2026-08-01")?.count).toBe(7);
    expect(result.changedEntries).toEqual([]);
  });

  it("resolves a tie the same way regardless of which side runs it", () => {
    // Both devices must land on the same value or they diverge permanently.
    const mine = entry("a", "2026-08-01", 3, 500);
    const theirs = entry("a", "2026-08-01", 8, 500);

    const a = mergeIncoming(snapshot([habit("a", 1)], [mine]), {
      ...NOTHING,
      entries: [theirs],
    });
    const b = mergeIncoming(snapshot([habit("a", 1)], [theirs]), {
      ...NOTHING,
      entries: [mine],
    });

    expect(a.snapshot.entries.get("a:2026-08-01")?.count).toBe(
      b.snapshot.entries.get("a:2026-08-01")?.count,
    );
  });

  it("drops a deleted habit's local history when the tombstone arrives alone", () => {
    const local = snapshot(
      [habit("a", 100), habit("b", 100)],
      [entry("a", "2026-08-01", 1, 100), entry("b", "2026-08-01", 1, 100)],
    );

    const result = mergeIncoming(local, {
      ...NOTHING,
      habits: [habit("a", 200, { deletedAt: 200 })],
    });

    expect(result.purgedHabitIds).toEqual(["a"]);
    expect(result.snapshot.entries.has("a:2026-08-01")).toBe(false);
    // The other habit is untouched.
    expect(result.snapshot.entries.has("b:2026-08-01")).toBe(true);
  });

  it("does not resurrect a deleted habit's entries sent in the same payload", () => {
    // The peer had not applied the tombstone yet and is still pushing history.
    const local = snapshot([habit("a", 100)], []);

    const result = mergeIncoming(local, {
      ...NOTHING,
      habits: [habit("a", 300, { deletedAt: 300 })],
      entries: [entry("a", "2026-08-01", 1, 400)],
    });

    expect(result.snapshot.entries.size).toBe(0);
    expect(result.changedEntries).toEqual([]);
  });

  it("keeps the tombstone rather than removing the habit row", () => {
    // A missing row would be indistinguishable from one the peer has not seen.
    const result = mergeIncoming(snapshot([habit("a", 100)], []), {
      ...NOTHING,
      habits: [habit("a", 200, { deletedAt: 200 })],
    });

    expect(result.snapshot.habits).toHaveLength(1);
    expect(result.snapshot.habits[0].deletedAt).toBe(200);
  });

  it("ignores entries for a habit it has never heard of", () => {
    const result = mergeIncoming(snapshot([], []), {
      ...NOTHING,
      entries: [entry("ghost", "2026-08-01", 1, 100)],
    });

    expect(result.snapshot.entries.size).toBe(0);
  });

  it("merges settings as one blob under last-write-wins", () => {
    const local = snapshot([], [], 100);

    const newer = mergeIncoming(local, {
      ...NOTHING,
      settings: {
        value: { ...DEFAULT_SETTINGS, favourites: ["q1"] },
        updatedAt: 200,
      },
    });
    expect(newer.settingsChanged).toBe(true);
    expect(newer.snapshot.settings.value.favourites).toEqual(["q1"]);

    const older = mergeIncoming(local, {
      ...NOTHING,
      settings: {
        value: { ...DEFAULT_SETTINGS, favourites: ["q1"] },
        updatedAt: 50,
      },
    });
    expect(older.settingsChanged).toBe(false);
    expect(older.snapshot.settings.value.favourites).toEqual([]);
  });

  it("reports only what changed, so only that reaches IndexedDB", () => {
    const local = snapshot(
      [habit("a", 100), habit("b", 100)],
      [entry("a", "2026-08-01", 1, 100), entry("b", "2026-08-01", 1, 100)],
    );

    const result = mergeIncoming(local, {
      ...NOTHING,
      habits: [habit("a", 50), habit("b", 300, { name: "renamed" })],
      entries: [entry("a", "2026-08-01", 4, 400)],
    });

    expect(result.changedHabits.map((h) => h.id)).toEqual(["b"]);
    expect(result.changedEntries).toHaveLength(1);
  });

  it("is idempotent — applying the same payload twice changes nothing the second time", () => {
    const incoming = {
      ...NOTHING,
      habits: [habit("a", 200)],
      entries: [entry("a", "2026-08-01", 3, 200)],
      settings: { value: DEFAULT_SETTINGS, updatedAt: 200 },
    };

    const once = mergeIncoming(snapshot([], []), incoming);
    const twice = mergeIncoming(once.snapshot, incoming);

    // Ties go to incoming, so a replay re-writes equal values but must not alter
    // the result — that is what makes a redundant push safe.
    expect(twice.snapshot.habits).toEqual(once.snapshot.habits);
    expect([...twice.snapshot.entries.entries()]).toEqual([
      ...once.snapshot.entries.entries(),
    ]);
    expect(twice.purgedHabitIds).toEqual([]);
  });
});

describe("collectPush", () => {
  it("sends only records newer than the watermark", () => {
    const local = snapshot(
      [habit("a", 100), habit("b", 300)],
      [entry("a", "2026-08-01", 1, 150), entry("b", "2026-08-02", 1, 400)],
      500,
    );

    const push = collectPush(local, 200);

    expect(push.habits.map((h) => h.id)).toEqual(["b"]);
    expect(push.entries.map((e) => e.date)).toEqual(["2026-08-02"]);
    expect(push.settings?.updatedAt).toBe(500);
    expect(push.complete).toBe(true);
  });

  it("omits settings that have not moved since the watermark", () => {
    expect(collectPush(snapshot([], [], 100), 100).settings).toBeNull();
  });

  it("includes tombstones — a deletion is an edit that has to travel", () => {
    const local = snapshot([habit("a", 300, { deletedAt: 300 })], []);
    expect(collectPush(local, 100).habits).toHaveLength(1);
  });

  it("truncates a backlog oldest-first and flags itself incomplete", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry("a", `2026-08-0${i + 1}`, 1, 100 + i),
    );
    const push = collectPush(snapshot([habit("a", 1)], entries), 0, 2);

    expect(push.complete).toBe(false);
    expect(push.entries.map((e) => e.updatedAt)).toEqual([100, 101]);
  });

  it("holds back newer records while older entries are still queued", () => {
    // Sent together, the habit's stamp would carry the watermark past 102–104.
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry("a", `2026-08-0${i + 1}`, 1, 100 + i),
    );
    const push = collectPush(snapshot([habit("a", 1000)], entries, 900), 0, 2);

    expect(push.entries.map((e) => e.updatedAt)).toEqual([100, 101]);
    expect(push.habits).toEqual([]);
    expect(push.settings).toBeNull();
    expect(watermarkAfterPush(push, 0)).toBe(101);
  });

  it("does not split a run of equal stamps across two pushes", () => {
    const entries = [100, 101, 101, 102].map((stamp, i) =>
      entry("a", `2026-08-0${i + 1}`, 1, stamp),
    );
    const first = collectPush(snapshot([], entries), 0, 2);
    expect(first.entries.map((e) => e.updatedAt)).toEqual([100]);

    const second = collectPush(
      snapshot([], entries),
      watermarkAfterPush(first, 0),
      2,
    );
    expect(second.entries.map((e) => e.updatedAt)).toEqual([101, 101]);
  });

  it("drains a whole backlog, every record exactly once", () => {
    const entries = Array.from({ length: 23 }, (_, i) =>
      entry(
        "a",
        `2026-07-${String(i + 1).padStart(2, "0")}`,
        1,
        100 + Math.floor(i / 2),
      ),
    );
    const local = snapshot([habit("a", 500), habit("b", 105)], entries, 300);

    const seen: string[] = [];
    let watermark = 0;
    for (let trip = 0; trip < 50; trip++) {
      const push = collectPush(local, watermark, 4);
      seen.push(
        ...push.habits.map((h) => h.id),
        ...push.entries.map((e) => e.date),
      );
      if (push.settings) seen.push("settings");
      watermark = watermarkAfterPush(push, watermark);
      if (push.complete) break;
    }

    expect(seen.sort()).toEqual(
      ["a", "b", "settings", ...entries.map((e) => e.date)].sort(),
    );
  });
});

describe("watermarkAfterPush", () => {
  it("advances to the newest stamp actually sent, not to the clock", () => {
    const sent = {
      habits: [habit("a", 300)],
      entries: [entry("a", "2026-08-01", 1, 250)],
      settings: null,
    };
    expect(watermarkAfterPush(sent, 100)).toBe(300);
  });

  it("never moves backwards on an empty push", () => {
    expect(
      watermarkAfterPush({ habits: [], entries: [], settings: null }, 100),
    ).toBe(100);
  });

  it("leaves an edit made during the request in flight eligible for the next push", () => {
    // Watermark 300 comes from the payload; an edit stamped 350 arriving mid-flight
    // still sits above it and will be selected next time.
    const watermark = watermarkAfterPush(
      { habits: [habit("a", 300)], entries: [], settings: null },
      0,
    );
    const local = snapshot([habit("a", 300), habit("b", 350)], []);

    expect(collectPush(local, watermark).habits.map((h) => h.id)).toEqual([
      "b",
    ]);
  });
});
