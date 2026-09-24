import "server-only";

/**
 * The server half of sync. See DESIGN.md §13. The merge rule is deliberately
 * not SQL: `ON CONFLICT` works right up to the content tiebreaker, and a rule
 * expressed twice in two languages drifts — the symptom being two devices
 * disagreeing forever. So the same `wins()` the client uses decides here too,
 * which `lockUser` makes safe to read-modify-write.
 */

import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  fingerprintEntry,
  fingerprintHabit,
  fingerprintSettings,
  MAX_ROWS_PER_REQUEST,
  TOMBSTONE_TTL_MS,
  wins,
  type SyncPull,
  type SyncPush,
} from "../sync/protocol";
import type { Entry, Habit, HabitColor } from "../types";
import type { SyncUser } from "./auth-types";
import type { Db } from "./db";
import { entries, habits, settings, users } from "./schema";
import { asUser, type Tx } from "./scope";

/** A fresh cursor value. See `syncSeq` in `schema.ts`. */
const NEXT_SEQ = sql`nextval('hapi_sync_seq')`;

/**
 * A distinct type so the route can answer 409 rather than 500: the client needs
 * telling that its local data belongs to someone else.
 */
export class AccountMismatchError extends Error {
  constructor(readonly actual: string) {
    super("Local data belongs to a different account.");
    this.name = "AccountMismatchError";
  }
}

export async function runSync(
  db: Db,
  user: SyncUser,
  push: SyncPush,
): Promise<SyncPull> {
  // Before the transaction: no reason to take a lock for a doomed request.
  if (push.accountId !== null && push.accountId !== user.id) {
    throw new AccountMismatchError(user.id);
  }

  // `asUser` rather than `db.transaction`: outside a scope the RLS policies in
  // `schema.ts` match nothing. See §13.15.
  return asUser(db, user.id, async (tx) => {
    await lockUser(tx, user.id);
    await ensureUser(tx, user);

    await applyPush(tx, user.id, push);
    await collectTombstones(tx, user.id);
    return pull(tx, user.id, push.since);
  });
}

/**
 * What makes `seq` a usable cursor: sequence values are assigned when a
 * statement runs but visible only on commit, so without this two syncs can
 * commit out of order and a client pulling in the gap steps over the lower one.
 * `hashtext` because the key must be a bigint; a collision costs only latency.
 */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

/**
 * `settings` and `habits` reference `users`, so the row must exist first.
 * `DO NOTHING`, or every sync becomes a write for a column sync never reads.
 */
async function ensureUser(tx: Tx, user: SyncUser): Promise<void> {
  await tx
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing({ target: users.id });
}

/**
 * See `TOMBSTONE_TTL_MS`, which is what the client collects against too. Inside
 * the sync transaction rather than on a cron: the work is tens of rows, the
 * lock is already held, and a delete here is invisible to `pull`. After
 * `applyPush`, so a very old tombstone arriving is written and then collected.
 */
async function collectTombstones(tx: Tx, userId: string): Promise<void> {
  await tx
    .delete(habits)
    .where(
      and(
        eq(habits.userId, userId),
        isNotNull(habits.deletedAt),
        lt(habits.deletedAt, Date.now() - TOMBSTONE_TTL_MS),
      ),
    );
}

async function applyPush(
  tx: Tx,
  userId: string,
  push: SyncPush,
): Promise<void> {
  const tombstoned = await pushHabits(tx, userId, push.habits);
  await pushEntries(tx, userId, push.entries, tombstoned.live);

  // After the pushed entries, so a peer pushing a deleted habit's entries
  // cannot reinstate them.
  if (tombstoned.newlyDeleted.length > 0) {
    await tx
      .delete(entries)
      .where(
        and(
          eq(entries.userId, userId),
          inArray(entries.habitId, tombstoned.newlyDeleted),
        ),
      );
  }

  await pushSettings(tx, userId, push.settings);
}

type HabitState = {
  /** Live ids: the only ones entries may attach to. */
  live: Set<string>;
  /** Ids whose tombstone was written by this request. */
  newlyDeleted: string[];
};

async function pushHabits(
  tx: Tx,
  userId: string,
  incoming: Habit[],
): Promise<HabitState> {
  // Every habit, not just the pushed ones: `pushEntries` needs the ones this
  // device has never sent.
  const current = await tx
    .select()
    .from(habits)
    .where(eq(habits.userId, userId));

  const byId = new Map(current.map((row) => [row.id, toHabit(row)]));
  const winners: Habit[] = [];
  const newlyDeleted: string[] = [];

  for (const habit of incoming) {
    const existing = byId.get(habit.id);
    if (!wins(habit, existing, fingerprintHabit)) continue;

    winners.push(habit);
    byId.set(habit.id, habit);
    if (habit.deletedAt !== null && existing?.deletedAt == null)
      newlyDeleted.push(habit.id);
  }

  if (winners.length > 0) {
    await tx
      .insert(habits)
      .values(
        winners.map((h) => ({
          userId,
          id: h.id,
          name: h.name,
          emoji: h.emoji,
          color: h.color,
          cadence: h.cadence,
          target: h.target,
          order: h.order,
          createdAt: h.createdAt,
          archivedAt: h.archivedAt,
          updatedAt: h.updatedAt,
          deletedAt: h.deletedAt,
          seq: NEXT_SEQ as unknown as number,
        })),
      )
      .onConflictDoUpdate({
        target: [habits.userId, habits.id],
        set: {
          name: sql`excluded.name`,
          emoji: sql`excluded.emoji`,
          color: sql`excluded.color`,
          cadence: sql`excluded.cadence`,
          target: sql`excluded.target`,
          // Quoted: `order` is a reserved word.
          order: sql`excluded."order"`,
          archivedAt: sql`excluded.archived_at`,
          updatedAt: sql`excluded.updated_at`,
          deletedAt: sql`excluded.deleted_at`,
          // A new cursor position is what makes other devices notice the row.
          seq: NEXT_SEQ,
        },
      });
  }

  const live = new Set<string>();
  for (const [id, habit] of byId) if (habit.deletedAt === null) live.add(id);

  return { live, newlyDeleted };
}

async function pushEntries(
  tx: Tx,
  userId: string,
  incoming: Entry[],
  live: Set<string>,
): Promise<void> {
  // Dropped rather than stored: the foreign key would reject them as an error
  // that fails the whole request, wedging that device's sync.
  const candidates = incoming.filter((e) => live.has(e.habitId));
  if (candidates.length === 0) return;

  const keys = sql.join(
    candidates.map((e) => sql`(${e.habitId}, ${e.date})`),
    sql`, `,
  );

  const current = await tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        // Row-value IN, so exactly the pushed keys are read: ids crossed with
        // dates reads the rectangle between them, most of a long history.
        sql`(${entries.habitId}, ${entries.date}) in (${keys})`,
      ),
    );

  const byKey = new Map(
    current.map((row) => [`${row.habitId}:${row.date}`, toEntry(row)]),
  );

  const winners = candidates.filter((entry) =>
    wins(entry, byKey.get(`${entry.habitId}:${entry.date}`), fingerprintEntry),
  );
  if (winners.length === 0) return;

  await tx
    .insert(entries)
    .values(
      winners.map((e) => ({
        userId,
        habitId: e.habitId,
        date: e.date,
        count: e.count,
        updatedAt: e.updatedAt,
        seq: NEXT_SEQ as unknown as number,
      })),
    )
    .onConflictDoUpdate({
      target: [entries.userId, entries.habitId, entries.date],
      set: {
        count: sql`excluded.count`,
        updatedAt: sql`excluded.updated_at`,
        seq: NEXT_SEQ,
      },
    });
}

async function pushSettings(
  tx: Tx,
  userId: string,
  incoming: SyncPush["settings"],
): Promise<void> {
  if (!incoming) return;

  const [current] = await tx
    .select()
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  const existing = current
    ? { value: current.value, updatedAt: current.updatedAt }
    : undefined;
  if (!wins(incoming, existing, fingerprintSettings)) return;

  await tx
    .insert(settings)
    .values({
      userId,
      value: incoming.value,
      updatedAt: incoming.updatedAt,
      seq: NEXT_SEQ as unknown as number,
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: {
        value: sql`excluded.value`,
        updatedAt: sql`excluded.updated_at`,
        seq: NEXT_SEQ,
      },
    });
}

async function pull(tx: Tx, userId: string, since: number): Promise<SyncPull> {
  const [habitRows, entryRows, settingsRows] = await Promise.all([
    tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, userId), gt(habits.seq, since)))
      .orderBy(habits.seq)
      .limit(MAX_ROWS_PER_REQUEST),
    tx
      .select()
      .from(entries)
      .where(and(eq(entries.userId, userId), gt(entries.seq, since)))
      .orderBy(entries.seq)
      .limit(MAX_ROWS_PER_REQUEST),
    tx
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), gt(settings.seq, since)))
      .limit(1),
  ]);

  const truncated =
    habitRows.length === MAX_ROWS_PER_REQUEST ||
    entryRows.length === MAX_ROWS_PER_REQUEST;
  const cursor = resumePoint(since, [habitRows, entryRows], [settingsRows]);

  return {
    seq: cursor,
    accountId: userId,
    // Withheld, not dropped: the next request starts at `cursor` and receives
    // them, where a row under a lower cursor is a lie the client cannot detect.
    habits: habitRows.filter((r) => r.seq <= cursor).map(toHabit),
    entries: entryRows.filter((r) => r.seq <= cursor).map(toEntry),
    settings:
      settingsRows.length > 0 && settingsRows[0].seq <= cursor
        ? { value: settingsRows[0].value, updatedAt: settingsRows[0].updatedAt }
        : null,
    more: truncated,
    serverNow: Date.now(),
  };
}

/**
 * The lowest point up to which *every* collection is complete. Not the highest
 * seq seen: habits cut short at 900 beside entries running to 4000 would report
 * 4000 and step over every habit between them.
 */
function resumePoint(
  since: number,
  capped: { seq: number }[][],
  uncapped: { seq: number }[][],
): number {
  let complete = Infinity;
  let highest = since;

  for (const rows of capped) {
    for (const row of rows) highest = Math.max(highest, row.seq);
    if (rows.length === MAX_ROWS_PER_REQUEST) {
      complete = Math.min(complete, rows[rows.length - 1].seq);
    }
  }
  for (const rows of uncapped) {
    for (const row of rows) highest = Math.max(highest, row.seq);
  }

  return complete === Infinity ? highest : Math.min(complete, highest);
}

/** Row → domain habit. Exported for `reminders.ts`, which reads the same rows. */
export function toHabit(row: typeof habits.$inferSelect): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    // Validated by `parseSyncPush`; the column is text so a new palette entry
    // needs no migration.
    color: row.color as HabitColor,
    cadence: row.cadence,
    target: row.target,
    order: row.order,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toEntry(row: typeof entries.$inferSelect): Entry {
  return {
    habitId: row.habitId,
    date: row.date,
    count: row.count,
    updatedAt: row.updatedAt,
  };
}
