import { describe, expect, it } from "vitest";
import { parseBackup, parseSyncPush } from "@/lib/sync/validate";

const HABIT = {
  id: "h1",
  name: "Read",
  emoji: "📖",
  color: "green",
  cadence: { kind: "daily" },
  target: 1,
  order: 0,
  createdAt: "2026-08-01",
  archivedAt: null,
  updatedAt: 1000,
  deletedAt: null,
};

const ENTRY = { habitId: "h1", date: "2026-08-01", count: 1, updatedAt: 1000 };

const SETTINGS = {
  value: {
    theme: "dark",
    weekStartsOn: 1,
    dayStartHour: 4,
    favourites: ["q1"],
  },
  updatedAt: 1000,
};

function push(over: Record<string, unknown> = {}) {
  return parseSyncPush({
    since: 0,
    accountId: null,
    habits: [],
    entries: [],
    settings: null,
    ...over,
  });
}

describe("parseSyncPush", () => {
  it("accepts a well-formed payload", () => {
    const result = push({
      habits: [HABIT],
      entries: [ENTRY],
      settings: SETTINGS,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, 42, "x", [], undefined]) {
      expect(parseSyncPush(body).ok).toBe(false);
    }
  });

  it("rejects a negative or fractional cursor", () => {
    expect(push({ since: -1 }).ok).toBe(false);
    expect(push({ since: 1.5 }).ok).toBe(false);
  });

  it("requires accountId to be present, as a string or an explicit null", () => {
    expect(push({ accountId: "user_1" }).ok).toBe(true);
    expect(push({ accountId: null }).ok).toBe(true);
    // Absent is not the same as null: a client that forgot the field would
    // otherwise be treated as one that has never synced, and be handed a pass on
    // the account check it exists to fail.
    expect(
      parseSyncPush({ since: 0, habits: [], entries: [], settings: null }).ok,
    ).toBe(false);
    expect(push({ accountId: "" }).ok).toBe(false);
    expect(push({ accountId: 7 }).ok).toBe(false);
  });

  it("rejects a colour that is neither a palette key nor a hex", () => {
    expect(push({ habits: [{ ...HABIT, color: "puce" }] }).ok).toBe(false);
    expect(push({ habits: [{ ...HABIT, color: "#f0f" }] }).ok).toBe(false);
    expect(push({ habits: [{ ...HABIT, color: "#ff00ff00" }] }).ok).toBe(false);
    expect(push({ habits: [{ ...HABIT, color: "rgb(255,0,255)" }] }).ok).toBe(
      false,
    );
    expect(push({ habits: [{ ...HABIT, color: 0xff00ff }] }).ok).toBe(false);
  });

  it("accepts a picked hex and lowercases it", () => {
    const parsed = push({ habits: [{ ...HABIT, color: "#FF00Ff" }] });
    expect(parsed.ok).toBe(true);
    // Case would otherwise reach `wins`, where two devices spelling the same
    // colour differently would keep swapping the row on every tie.
    expect(parsed.ok && parsed.value.habits[0].color).toBe("#ff00ff");
  });

  it("rejects a date that does not exist", () => {
    // Date would roll this to March 2nd rather than reject it.
    expect(push({ habits: [{ ...HABIT, createdAt: "2026-02-30" }] }).ok).toBe(
      false,
    );
    expect(push({ entries: [{ ...ENTRY, date: "2026-13-01" }] }).ok).toBe(
      false,
    );
  });

  it("rejects a date that is merely the right shape", () => {
    expect(push({ entries: [{ ...ENTRY, date: "01/08/2026" }] }).ok).toBe(
      false,
    );
    expect(
      push({ entries: [{ ...ENTRY, date: "2026-08-01T00:00:00Z" }] }).ok,
    ).toBe(false);
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(push({ entries: [{ ...ENTRY, date: "2028-02-29" }] }).ok).toBe(true);
    expect(push({ entries: [{ ...ENTRY, date: "2027-02-29" }] }).ok).toBe(
      false,
    );
  });

  it("rejects an over-long name rather than storing what other devices must render", () => {
    expect(push({ habits: [{ ...HABIT, name: "x".repeat(121) }] }).ok).toBe(
      false,
    );
    expect(push({ habits: [{ ...HABIT, name: "x".repeat(120) }] }).ok).toBe(
      true,
    );
  });

  it("rejects a target below one", () => {
    expect(push({ habits: [{ ...HABIT, target: 0 }] }).ok).toBe(false);
  });

  it("validates each cadence variant", () => {
    expect(
      push({ habits: [{ ...HABIT, cadence: { kind: "weekly", times: 3 } }] })
        .ok,
    ).toBe(true);
    expect(
      push({ habits: [{ ...HABIT, cadence: { kind: "weekly", times: 0 } }] })
        .ok,
    ).toBe(false);
    expect(
      push({
        habits: [{ ...HABIT, cadence: { kind: "weekdays", days: [1, 3] } }],
      }).ok,
    ).toBe(true);
    expect(
      push({ habits: [{ ...HABIT, cadence: { kind: "weekdays", days: [7] } }] })
        .ok,
    ).toBe(false);
    expect(
      push({ habits: [{ ...HABIT, cadence: { kind: "monthly" } }] }).ok,
    ).toBe(false);
  });

  it("normalises weekdays so two devices fingerprint the same cadence alike", () => {
    const result = push({
      habits: [{ ...HABIT, cadence: { kind: "weekdays", days: [3, 1, 3] } }],
    });
    expect(result.ok && result.value.habits[0].cadence).toEqual({
      kind: "weekdays",
      days: [1, 3],
    });
  });

  it("strips properties it was not expecting", () => {
    const result = push({ habits: [{ ...HABIT, isAdmin: true }] });
    expect(result.ok && "isAdmin" in result.value.habits[0]).toBe(false);
  });

  it("rejects a batch larger than one request may carry", () => {
    const entries = Array.from({ length: 501 }, (_, i) => ({
      ...ENTRY,
      count: i,
    }));
    expect(push({ entries }).ok).toBe(false);
  });

  it("names the offending index, since a push is chunked", () => {
    const result = push({ entries: [ENTRY, { ...ENTRY, count: -1 }] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("entries[1]");
  });

  it("accepts null settings and rejects a malformed one", () => {
    expect(push({ settings: null }).ok).toBe(true);
    expect(push({ settings: { value: SETTINGS.value } }).ok).toBe(false);
    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, dayStartHour: 9 },
        },
      }).ok,
    ).toBe(false);
    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, weekStartsOn: 2 },
        },
      }).ok,
    ).toBe(false);
  });

  it("drops a theme a pre-§13.8-#1 device still pushes, rather than refusing it", () => {
    // Appearance became device-local, but a device on the older build keeps
    // sending the field. Refusing the blob would stop that device syncing its
    // habits over a preference this build does not store at all.
    for (const theme of ["dark", "neon", 7, null]) {
      const result = push({
        settings: { ...SETTINGS, value: { ...SETTINGS.value, theme } },
      });
      expect(result.ok).toBe(true);
      expect(
        result.ok === true && result.value.settings?.value,
      ).not.toHaveProperty("theme");
    }
  });

  it("treats a missing haptics flag as the default, not as malformed", () => {
    // A device on a build from before the field existed still has to sync.
    const result = push({ settings: SETTINGS });
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value.settings?.value.haptics).toBe(
      true,
    );

    expect(
      push({
        settings: { ...SETTINGS, value: { ...SETTINGS.value, haptics: false } },
      }).ok,
    ).toBe(true);
    expect(
      push({
        settings: { ...SETTINGS, value: { ...SETTINGS.value, haptics: "yes" } },
      }).ok,
    ).toBe(false);
  });

  it("treats a missing reminderHour as the default, not as malformed", () => {
    const result = push({ settings: SETTINGS });
    expect(result.ok).toBe(true);
    expect(
      result.ok === true && result.value.settings?.value.reminderHour,
    ).toBe(9);

    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, reminderHour: 0 },
        },
      }).ok,
    ).toBe(true);
    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, reminderHour: 23 },
        },
      }).ok,
    ).toBe(true);
    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, reminderHour: 24 },
        },
      }).ok,
    ).toBe(false);
    expect(
      push({
        settings: {
          ...SETTINGS,
          value: { ...SETTINGS.value, reminderHour: -1 },
        },
      }).ok,
    ).toBe(false);
  });

  it("treats missing dailyTags as the default, and accepts a tag it has never heard of", () => {
    const result = push({ settings: SETTINGS });
    expect(result.ok).toBe(true);
    expect(
      result.ok === true && result.value.settings?.value.dailyTags,
    ).toEqual([]);

    const withTags = (dailyTags: unknown) =>
      push({
        settings: { ...SETTINGS, value: { ...SETTINGS.value, dailyTags } },
      });

    expect(withTags(["discipline", "space"]).ok).toBe(true);
    // Checked for shape, not membership: the unions grow, and a device on a
    // newer build must not have its whole blob — habits included — refused over
    // a tag name this release does not know. `lib/daily.ts` ignores it.
    expect(withTags(["a-tag-from-the-future"]).ok).toBe(true);

    expect(withTags("discipline").ok).toBe(false);
    expect(withTags([7]).ok).toBe(false);
    expect(withTags([""]).ok).toBe(false);
  });

  it("accepts a tombstone", () => {
    expect(push({ habits: [{ ...HABIT, deletedAt: 2000 }] }).ok).toBe(true);
    expect(push({ habits: [{ ...HABIT, deletedAt: -5 }] }).ok).toBe(false);
  });
});

describe("parseBackup", () => {
  function backup(over: Record<string, unknown> = {}) {
    return parseBackup({
      version: 2,
      exportedAt: "2026-09-01T00:00:00.000Z",
      habits: [HABIT],
      entries: [ENTRY],
      settings: SETTINGS.value,
      ...over,
    });
  }

  it("accepts an export, dropping the appearance field a sync push drops", () => {
    const result = backup();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.settings).not.toHaveProperty("theme");
  });

  it("refuses a record the sync endpoint would refuse, naming it", () => {
    const result = backup({
      entries: [ENTRY, { ...ENTRY, date: "2026-02-30" }],
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("entries[1]"),
    });
  });

  it("refuses a file that is not a backup at all", () => {
    for (const file of [null, [], { version: 3, habits: [] }, { version: 2 }]) {
      expect(parseBackup(file).ok).toBe(false);
    }
  });

  it("takes more records than one sync request carries", () => {
    const entries = Array.from({ length: 1200 }, (_, i) => ({
      ...ENTRY,
      date: new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10),
    }));
    expect(backup({ entries }).ok).toBe(true);
  });

  it("fills in a v1 habit's sync metadata and a missing setting", () => {
    const legacy: Record<string, unknown> = { ...HABIT };
    delete legacy.updatedAt;
    delete legacy.deletedAt;
    const result = backup({
      version: 1,
      habits: [legacy],
      settings: { weekStartsOn: 0, dayStartHour: 0, favourites: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(2);
    expect(result.value.habits[0].updatedAt).toBe(
      Date.parse("2026-08-01T00:00:00Z"),
    );
    expect(result.value.settings.reminderHour).toBe(9);
  });

  it("leaves tombstones out, which an export never writes", () => {
    const result = backup({
      habits: [HABIT, { ...HABIT, id: "gone", deletedAt: 5 }],
    });
    expect(result.ok && result.value.habits.map((h) => h.id)).toEqual(["h1"]);
  });
});
