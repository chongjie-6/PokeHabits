/**
 * Payload validation for the sync endpoint and for backup files. The caps do
 * more than reject malformed data: what is accepted here goes back out to every
 * other device, so bounding at the boundary keeps one bad request from becoming
 * a payload that breaks the user's phone on every sync. Hand-written, the
 * surface being small and fixed.
 */

import {
  DEFAULT_SETTINGS,
  normaliseHabit,
  normaliseHabitColor,
  type Cadence,
  type Entry,
  type ExportBundle,
  type Habit,
  type Settings,
} from "../types";
import { MAX_ROWS_PER_REQUEST, type SyncPush } from "./protocol";

/** Generous enough that no real habit hits it, small enough to be harmless. */
const MAX_NAME = 120;
const MAX_EMOJI = 16;
const MAX_ID = 64;
const MAX_TARGET = 1000;
const MAX_COUNT = 100_000;
const MAX_FAVOURITES = 5000;
/** Comfortably past both tag unions put together, with room for both to grow. */
const MAX_TAGS = 200;
const MAX_ORDER = 100_000;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= MAX_ID
  );
}

/** A non-negative integer within the safe-integer range — every stamp and count. */
function isCount(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function isStamp(value: unknown): value is number {
  return isCount(value, Number.MAX_SAFE_INTEGER);
}

/**
 * Checked for existence, not shape: the round trip rejects '2026-02-30', which
 * `Date` would roll forward to March 2nd.
 */
function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function parseCadence(value: unknown): ParseResult<Cadence> {
  if (!isObject(value)) return fail("cadence must be an object");

  switch (value.kind) {
    case "daily":
      return { ok: true, value: { kind: "daily" } };

    case "weekdays": {
      if (!Array.isArray(value.days))
        return fail("cadence.days must be an array");
      if (value.days.length > 7)
        return fail("cadence.days has more than seven days");
      if (!value.days.every((d) => isCount(d, 6)))
        return fail("cadence.days must be 0–6");
      // Sorted so the fingerprint is stable across devices that stored the
      // same days in another order.
      const days = [...new Set(value.days as number[])].sort((a, b) => a - b);
      return { ok: true, value: { kind: "weekdays", days } };
    }

    case "weekly": {
      if (!isCount(value.times, 7) || value.times < 1)
        return fail("cadence.times must be 1–7");
      return { ok: true, value: { kind: "weekly", times: value.times } };
    }

    default:
      return fail(`unknown cadence kind: ${String(value.kind)}`);
  }
}

function parseHabit(value: unknown): ParseResult<Habit> {
  if (!isObject(value)) return fail("habit must be an object");
  if (!isId(value.id)) return fail("habit.id must be a non-empty string");
  if (typeof value.name !== "string" || value.name.length > MAX_NAME) {
    return fail(
      `habit.name must be a string of at most ${MAX_NAME} characters`,
    );
  }
  if (typeof value.emoji !== "string" || value.emoji.length > MAX_EMOJI) {
    return fail("habit.emoji must be a short string");
  }
  if (!isCount(value.target, MAX_TARGET) || value.target < 1) {
    return fail(`habit.target must be 1–${MAX_TARGET}`);
  }
  if (!isCount(value.order, MAX_ORDER))
    return fail("habit.order must be a non-negative integer");
  if (!isDayKey(value.createdAt))
    return fail("habit.createdAt must be a YYYY-MM-DD date");
  if (value.archivedAt !== null && !isDayKey(value.archivedAt)) {
    return fail("habit.archivedAt must be a YYYY-MM-DD date or null");
  }
  if (!isStamp(value.updatedAt))
    return fail("habit.updatedAt must be epoch ms");
  if (value.deletedAt !== null && !isStamp(value.deletedAt)) {
    return fail("habit.deletedAt must be epoch ms or null");
  }

  // Lowercased so two devices that spelled one colour differently still
  // fingerprint alike in `protocol.ts:wins`.
  const color =
    typeof value.color === "string" ? normaliseHabitColor(value.color) : null;
  if (color === null)
    return fail("habit.color must be a palette key or a #rrggbb colour");

  const cadence = parseCadence(value.cadence);
  if (!cadence.ok) return cadence;

  return {
    ok: true,
    // Field by field, so no unexpected property rides into the database.
    value: {
      id: value.id,
      name: value.name,
      emoji: value.emoji,
      color,
      cadence: cadence.value,
      target: value.target,
      order: value.order,
      createdAt: value.createdAt,
      archivedAt: value.archivedAt as string | null,
      updatedAt: value.updatedAt,
      deletedAt: value.deletedAt as number | null,
    },
  };
}

function parseEntry(value: unknown): ParseResult<Entry> {
  if (!isObject(value)) return fail("entry must be an object");
  if (!isId(value.habitId))
    return fail("entry.habitId must be a non-empty string");
  if (!isDayKey(value.date))
    return fail("entry.date must be a YYYY-MM-DD date");
  if (!isCount(value.count, MAX_COUNT))
    return fail("entry.count must be a non-negative integer");
  if (!isStamp(value.updatedAt))
    return fail("entry.updatedAt must be epoch ms");

  return {
    ok: true,
    value: {
      habitId: value.habitId,
      date: value.date,
      count: value.count,
      updatedAt: value.updatedAt,
    },
  };
}

function parseSettings(value: unknown): ParseResult<Settings> {
  if (!isObject(value)) return fail("settings must be an object");
  // `theme` is accepted and dropped, not rejected: it was synced until §13.8 #1,
  // and refusing an older build's blob would stop it syncing habits too.
  if (value.weekStartsOn !== 0 && value.weekStartsOn !== 1) {
    return fail("settings.weekStartsOn must be 0 or 1");
  }
  if (!isCount(value.dayStartHour, 6))
    return fail("settings.dayStartHour must be 0–6");
  // Optional for the reason `haptics` is: a build from before reminders pushes
  // a blob without it.
  if (value.reminderHour !== undefined && !isCount(value.reminderHour, 23)) {
    return fail("settings.reminderHour must be 0–23");
  }
  // Null is off, and undefined is a build from before the evening slot existed.
  if (
    value.eveningReminderHour !== undefined &&
    value.eveningReminderHour !== null &&
    !isCount(value.eveningReminderHour, 23)
  ) {
    return fail("settings.eveningReminderHour must be 0–23 or null");
  }
  // Optional, unlike its neighbours: a build from before haptics pushes a blob
  // without it, and rejecting that would stop it syncing at all.
  if (value.haptics !== undefined && typeof value.haptics !== "boolean") {
    return fail("settings.haptics must be a boolean");
  }
  // Checked against the union, not "is a string": an unknown mode would leave
  // every other device's daily card with no corpus.
  if (
    value.dailyMode !== undefined &&
    value.dailyMode !== "quotes" &&
    value.dailyMode !== "facts"
  ) {
    return fail("settings.dailyMode must be 'quotes' or 'facts'");
  }
  if (!Array.isArray(value.favourites))
    return fail("settings.favourites must be an array");
  if (value.favourites.length > MAX_FAVOURITES)
    return fail("settings.favourites is too long");
  if (!value.favourites.every(isId)) {
    return fail("settings.favourites must be quote or fact ids");
  }
  // Shape rather than membership: the unions grow, and a newer build must be
  // able to push a tag this one has never heard of — `lib/daily.ts` intersects
  // with the corpus, so an unknown tag narrows nothing.
  if (value.dailyTags !== undefined) {
    if (!Array.isArray(value.dailyTags))
      return fail("settings.dailyTags must be an array");
    if (value.dailyTags.length > MAX_TAGS)
      return fail("settings.dailyTags is too long");
    if (!value.dailyTags.every(isId))
      return fail("settings.dailyTags must be tag names");
  }

  return {
    ok: true,
    value: {
      weekStartsOn: value.weekStartsOn,
      dayStartHour: value.dayStartHour,
      reminderHour: value.reminderHour ?? DEFAULT_SETTINGS.reminderHour,
      eveningReminderHour:
        (value.eveningReminderHour as number | null | undefined) ?? null,
      haptics: value.haptics ?? DEFAULT_SETTINGS.haptics,
      dailyMode: value.dailyMode ?? DEFAULT_SETTINGS.dailyMode,
      favourites: value.favourites as string[],
      dailyTags:
        (value.dailyTags as string[] | undefined) ?? DEFAULT_SETTINGS.dailyTags,
    },
  };
}

function parseList<T>(
  value: unknown,
  field: string,
  parse: (item: unknown) => ParseResult<T>,
  max: number = MAX_ROWS_PER_REQUEST,
): ParseResult<T[]> {
  if (!Array.isArray(value)) return fail(`${field} must be an array`);
  if (value.length > max) {
    return fail(`${field} has more than ${max} records`);
  }

  const out: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const parsed = parse(value[i]);
    // The client chunks its push; without the index there is no way to find
    // the record at fault.
    if (!parsed.ok) return fail(`${field}[${i}]: ${parsed.message}`);
    out.push(parsed.value);
  }
  return { ok: true, value: out };
}

/**
 * Held to the rules a push is held to, because everything imported is pushed
 * next sync and one refused record stops this device syncing at all — checked
 * here, that is a message at the moment the file was chosen. Uncapped, a year
 * of history being one file; tombstones dropped, an export never writing one.
 */
export function parseBackup(value: unknown): ParseResult<ExportBundle> {
  if (!isObject(value)) return fail("the file is not a backup");
  if (value.version !== 1 && value.version !== 2) {
    return fail(`unsupported backup version ${String(value.version)}`);
  }
  if (!Array.isArray(value.habits)) return fail("habits must be an array");

  const habits = parseList(
    value.habits.map((h) =>
      isObject(h)
        ? normaliseHabit(h as Parameters<typeof normaliseHabit>[0])
        : h,
    ),
    "habits",
    parseHabit,
    Infinity,
  );
  if (!habits.ok) return habits;

  const entries = parseList(value.entries, "entries", parseEntry, Infinity);
  if (!entries.ok) return entries;

  // Over the defaults: a file from before a setting existed does not carry it.
  const stored = isObject(value.settings) ? value.settings : {};
  const settings = parseSettings({ ...DEFAULT_SETTINGS, ...stored });
  if (!settings.ok) return settings;

  return {
    ok: true,
    value: {
      version: 2,
      exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
      habits: habits.value.filter((h) => h.deletedAt === null),
      entries: entries.value,
      settings: settings.value,
    },
  };
}

export function parseSyncPush(body: unknown): ParseResult<SyncPush> {
  if (!isObject(body)) return fail("body must be a JSON object");
  if (!isStamp(body.since)) return fail("since must be a non-negative integer");
  if (body.accountId !== null && !isId(body.accountId)) {
    return fail("accountId must be a non-empty string or null");
  }

  const habits = parseList(body.habits, "habits", parseHabit);
  if (!habits.ok) return habits;

  const entries = parseList(body.entries, "entries", parseEntry);
  if (!entries.ok) return entries;

  let settings: SyncPush["settings"] = null;
  if (body.settings !== null && body.settings !== undefined) {
    if (!isObject(body.settings))
      return fail("settings must be an object or null");
    if (!isStamp(body.settings.updatedAt))
      return fail("settings.updatedAt must be epoch ms");

    const value = parseSettings(body.settings.value);
    if (!value.ok) return value;
    settings = { value: value.value, updatedAt: body.settings.updatedAt };
  }

  return {
    ok: true,
    value: {
      since: body.since,
      accountId: body.accountId as string | null,
      habits: habits.value,
      entries: entries.value,
      settings,
    },
  };
}
