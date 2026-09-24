/**
 * The last-write-wins rule and the fingerprints it breaks ties on. `wins` was
 * reached only through `mergeIncoming` and `runSync`, which test the rule's
 * *effects*; these test the rule.
 */

import { describe, expect, it } from "vitest";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  wins,
} from "@/lib/sync/protocol";
import { DEFAULT_SETTINGS, type Entry, type Habit } from "@/lib/types";

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "read",
    emoji: "📖",
    color: "green",
    cadence: { kind: "daily" },
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt: 100,
    deletedAt: null,
    ...over,
  };
}

function entry(over: Partial<Entry> = {}): Entry {
  return {
    habitId: "h",
    date: "2026-08-01",
    count: 1,
    updatedAt: 100,
    ...over,
  };
}

const print = (record: { updatedAt: number; tag?: string }) => record.tag ?? "";

describe("wins", () => {
  it("accepts anything when there is nothing to compare against", () => {
    expect(wins({ updatedAt: 0 }, undefined, print)).toBe(true);
  });

  it("prefers the later stamp in both directions", () => {
    expect(wins({ updatedAt: 200 }, { updatedAt: 100 }, print)).toBe(true);
    expect(wins({ updatedAt: 100 }, { updatedAt: 200 }, print)).toBe(false);
  });

  it("breaks a tie on content, not on which side is incoming", () => {
    const a = { updatedAt: 100, tag: "aaa" };
    const b = { updatedAt: 100, tag: "bbb" };

    // The property that matters: both devices pick the same winner. "Incoming
    // wins ties" would answer true here *and* true with the arguments swapped,
    // so the two would trade values forever and never converge.
    expect(wins(b, a, print)).toBe(true);
    expect(wins(a, b, print)).toBe(false);
  });

  it("rejects a record identical to the one already held", () => {
    const same = { updatedAt: 100, tag: "x" };
    // Equal fingerprints mean an identical record, so this is also what keeps a
    // replayed push off the disk.
    expect(wins({ ...same }, same, print)).toBe(false);
  });
});

describe("fingerprintHabit", () => {
  it("changes when any field the user can edit changes", () => {
    const base = fingerprintHabit(habit());
    const fields: Partial<Habit>[] = [
      { name: "run" },
      { emoji: "🏃" },
      { color: "blue" },
      { target: 3 },
      { order: 2 },
      { archivedAt: "2026-09-01" },
      { deletedAt: 500 },
      { cadence: { kind: "weekly", times: 3 } },
      { cadence: { kind: "weekdays", days: [1, 3] } },
    ];

    for (const field of fields) {
      expect(fingerprintHabit(habit(field))).not.toBe(base);
    }
  });

  it("ignores the fields that are fixed for the life of a record", () => {
    // `id` and `createdAt` cannot differ between two copies of the same habit,
    // so including them would only add noise to the tiebreak.
    expect(
      fingerprintHabit(habit({ id: "other", createdAt: "2020-01-01" })),
    ).toBe(fingerprintHabit(habit()));
  });

  it("tells two weekday cadences apart", () => {
    const monday = habit({ cadence: { kind: "weekdays", days: [1] } });
    const tuesday = habit({ cadence: { kind: "weekdays", days: [2] } });
    expect(fingerprintHabit(monday)).not.toBe(fingerprintHabit(tuesday));
  });

  it("does not depend on the order the object was built in", () => {
    // The reason this is field-by-field rather than `JSON.stringify`, whose
    // output follows key insertion order: the same habit built by two code paths
    // would serialise differently and break the symmetry `wins` needs.
    const forwards: Habit = habit();
    const backwards = Object.fromEntries(
      Object.entries(habit()).reverse(),
    ) as unknown as Habit;

    expect(fingerprintHabit(backwards)).toBe(fingerprintHabit(forwards));
  });
});

describe("fingerprintEntry", () => {
  it("is the count, which is all an entry carries", () => {
    expect(fingerprintEntry(entry({ count: 2 }))).not.toBe(
      fingerprintEntry(entry({ count: 3 })),
    );
    expect(fingerprintEntry(entry({ updatedAt: 999 }))).toBe(
      fingerprintEntry(entry()),
    );
  });
});

describe("fingerprintSettings", () => {
  it("changes with every synced field", () => {
    const base = fingerprintSettings({ value: DEFAULT_SETTINGS });

    for (const value of [
      { ...DEFAULT_SETTINGS, weekStartsOn: 0 as const },
      { ...DEFAULT_SETTINGS, dayStartHour: 4 },
      { ...DEFAULT_SETTINGS, reminderHour: 7 },
      { ...DEFAULT_SETTINGS, haptics: false },
      { ...DEFAULT_SETTINGS, favourites: ["q1"] },
    ]) {
      expect(fingerprintSettings({ value })).not.toBe(base);
    }
  });

  it("does not care what order the favourites were saved in", () => {
    const one = { value: { ...DEFAULT_SETTINGS, favourites: ["a", "b"] } };
    const other = { value: { ...DEFAULT_SETTINGS, favourites: ["b", "a"] } };
    expect(fingerprintSettings(one)).toBe(fingerprintSettings(other));
  });

  it("says nothing about appearance", () => {
    // Theme left the synced blob with §13.8 #1. A stale field riding along on an
    // older device's push must not change the fingerprint, or the two would
    // disagree about a value neither of them stores.
    const withTheme = {
      value: { ...DEFAULT_SETTINGS, theme: "dark" } as never,
    };
    expect(fingerprintSettings(withTheme)).toBe(
      fingerprintSettings({ value: DEFAULT_SETTINGS }),
    );
  });
});
