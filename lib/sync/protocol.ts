/**
 * The sync wire format. See DESIGN.md §13.
 *
 * Push and pull are one request so they stay atomic. Two clocks, never
 * conflated: `updatedAt` (client epoch ms) decides merges, `seq` (one Postgres
 * sequence) moves the pull cursor.
 */

import type { Entry, Habit, Settings } from "../types";

/** Records the client believes are newer than what the server holds. */
export type SyncPush = {
  /** Highest `seq` already applied; 0 pulls the account's entire history. */
  since: number;
  /**
   * Null if this client has never synced. Stated up front so the server can
   * refuse a mismatch *before* applying anything — otherwise a device someone
   * else has since signed in on uploads the previous person's habits.
   */
  accountId: string | null;
  habits: Habit[];
  entries: Entry[];
  /** Omitted when settings have not changed since the last successful sync. */
  settings: { value: Settings; updatedAt: number } | null;
};

/** Everything stored past `since`, after the push has been merged in. */
export type SyncPull = {
  /** Persist only after the response is applied: a cursor saved ahead of its data is a silent gap. */
  seq: number;
  /** The account actually written to. The client records it and checks it. */
  accountId: string;
  habits: Habit[];
  entries: Entry[];
  settings: { value: Settings; updatedAt: number } | null;
  /**
   * Truncated, another round trip due. Reported rather than counted: after the
   * clamp in `resumePoint` a truncated collection can hold fewer rows than the
   * limit, so counting would stop the client halfway through its history.
   */
  more: boolean;
  /** Server clock, epoch ms; the client warns on skew that would corrupt merge ordering. */
  serverNow: number;
};

export type SyncErrorCode =
  | "unauthenticated"
  | "account-mismatch"
  | "payload-too-large"
  | "malformed"
  /** The only code worth retrying unchanged — rate, not content. See §13.17. */
  | "rate-limited"
  | "server-error";

export type SyncErrorBody = { error: SyncErrorCode; message: string };

/**
 * Cap per collection per request. A first sync of a multi-year account is tens
 * of thousands of entries; the server truncates and leaves the cursor short so
 * the next round trip resumes where this one stopped.
 */
export const MAX_ROWS_PER_REQUEST = 500;

/** Beyond this much clock skew, LWW ordering stops being trustworthy. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Tombstone lifetime. See DESIGN.md §13.8 #3. The window bounds resurrection,
 * not storage: a device offline longer comes back holding a live copy nothing
 * contradicts. Both halves must use this constant, not two agreeing numbers.
 */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Last-write-wins. Ties break on content, not on "incoming wins": that is
 * symmetric, where incoming-wins makes two devices swap values forever instead
 * of converging. Equal fingerprints also keep a replayed push off the disk.
 */
export function wins<T extends { updatedAt: number }>(
  incoming: T,
  existing: T | undefined,
  fingerprint: (record: T) => string,
): boolean {
  if (!existing) return true;
  if (incoming.updatedAt !== existing.updatedAt)
    return incoming.updatedAt > existing.updatedAt;
  return fingerprint(incoming) > fingerprint(existing);
}

/**
 * Field by field rather than `JSON.stringify`, whose key order follows
 * insertion — the same habit built two ways would serialise differently and
 * break the symmetry. Only fields a user can change.
 */
export function fingerprintHabit(h: Habit): string {
  return [
    h.name,
    h.emoji,
    h.color,
    h.target,
    h.order,
    h.archivedAt ?? "",
    h.deletedAt ?? "",
    h.cadence.kind,
    h.cadence.kind === "weekdays" ? h.cadence.days.join(",") : "",
    h.cadence.kind === "weekly" ? h.cadence.times : "",
  ].join(" ");
}

export function fingerprintEntry(e: Entry): string {
  return String(e.count);
}

export function fingerprintSettings(s: { value: Settings }): string {
  return [
    s.value.weekStartsOn,
    s.value.dayStartHour,
    s.value.reminderHour,
    s.value.eveningReminderHour ?? "",
    s.value.haptics,
    s.value.dailyMode,
    // Sorted, so two devices that favourited the same quotes in a different
    // order still fingerprint identically and neither write wins spuriously.
    [...s.value.favourites].sort().join(","),
  ].join(" ");
}
