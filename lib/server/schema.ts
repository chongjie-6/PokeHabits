/**
 * Server schema. See DESIGN.md §13. It follows `lib/types.ts` bar three
 * differences: `userId` is part of every primary key, because "unlikely to
 * collide" is the wrong standard for a key that decides whose data you read;
 * civil dates stay `text`, so no timezone conversion can creep in; and each row
 * carries `seq` beside `updatedAt`. Every table is under row-level security,
 * opened by `lib/server/scope.ts` (§13.15).
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Cadence, Settings } from "../types";

/**
 * NULL when nobody opened a scope, and an untrue policy denies the row — so a
 * statement that forgets who it is for reads nothing rather than everything.
 * The missing-ok second argument is what makes an unset setting NULL.
 */
const owner = () => sql`user_id = current_setting('openhabits.user_id', true)`;

/**
 * For the two operations that are not on behalf of one account: the hourly
 * sweep and the subscribe upsert. **Not granted on `habits`, `entries` or
 * `users`** — habit content has no bypass anywhere in this codebase.
 */
const server = () => sql`current_setting('openhabits.scope', true) = 'server'`;

/**
 * One global sequence rather than one per user: cursors only need to be
 * monotonic *within* an account, and the numbers gap harmlessly between them.
 * The pre-rebrand name stays — renaming migrates a live counter for nothing.
 */
export const syncSeq = pgSequence("hapi_sync_seq");

export const users = pgTable(
  "users",
  {
    /** Opaque id from whatever identity provider is wired up. See `lib/server/auth.ts`. */
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    // The only table whose owning column is `id` rather than `user_id`.
    pgPolicy("users_owner", {
      for: "all",
      using: sql`id = current_setting('openhabits.user_id', true)`,
      withCheck: sql`id = current_setting('openhabits.user_id', true)`,
    }),
  ],
).enableRLS();

export const habits = pgTable(
  "habits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
    cadence: jsonb("cadence").$type<Cadence>().notNull(),
    target: integer("target").notNull(),
    order: integer("order").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
    /** Client epoch ms. Decides merges. */
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    /** Client epoch ms, or null when live. A tombstone, never a removed row. */
    deletedAt: bigint("deleted_at", { mode: "number" }),
    /** Server sequence. Drives the pull cursor. */
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // Every read is "this user's rows past this cursor, in cursor order".
    index("habits_user_seq_idx").on(t.userId, t.seq),
    pgPolicy("habits_owner", {
      for: "all",
      using: owner(),
      withCheck: owner(),
    }),
  ],
).enableRLS();

export const entries = pgTable(
  "entries",
  {
    userId: text("user_id").notNull(),
    habitId: text("habit_id").notNull(),
    date: text("date").notNull(),
    count: integer("count").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  (t) => [
    // Uniqueness is what makes a replayed push harmless: one tick, one row.
    primaryKey({ columns: [t.userId, t.habitId, t.date] }),
    index("entries_user_seq_idx").on(t.userId, t.seq),
    // A backstop: habits are upserted first and `applyPush` drops orphans, but
    // an entry without its habit is unreadable.
    foreignKey({
      columns: [t.userId, t.habitId],
      foreignColumns: [habits.userId, habits.id],
      name: "entries_habit_fk",
    }).onDelete("cascade"),
    pgPolicy("entries_owner", {
      for: "all",
      using: owner(),
      withCheck: owner(),
    }),
  ],
).enableRLS();

export const settings = pgTable(
  "settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<Settings>().notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  () => [
    pgPolicy("settings_owner", {
      for: "all",
      using: owner(),
      withCheck: owner(),
    }),
    // Read-only, and the sweep is the only reader: it needs the hour fields for
    // every device in one pass. The habits it counts stay under the account.
    pgPolicy("settings_server", { for: "select", using: server() }),
  ],
).enableRLS();

/**
 * One row per browser that asked for reminders (§8.5), unlike every other table
 * here in three ways. **Keyed on the endpoint alone**: two accounts holding
 * live rows for one device would deliver one person's habits to the other's
 * tray, so overwriting is what makes handing a device over safe. **No `seq`
 * and no tombstone**, because these are device facts the client can rebuild
 * from `PushManager`. And `timeZone` is stored, since the zone belongs to the
 * device rather than the account and cannot ride the synced blob.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The two keys from `PushSubscription.toJSON().keys`, base64url. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** IANA zone name, validated against ICU before it is stored. */
    timeZone: text("time_zone").notNull(),
    /**
     * The last civil day a reminder went to this device. The cron is hourly,
     * and this is what keeps a mid-morning change of hour from sending twice.
     */
    lastSentDay: text("last_sent_day"),
    /** The same, for the evening slot, which is claimed independently. */
    lastSentEveningDay: text("last_sent_evening_day"),
    /**
     * Last time this browser said it still wanted reminders; the sweep drops a
     * row quiet for longer than `SUBSCRIPTION_TTL_MS`. Not `createdAt`, which
     * is oldest on exactly the devices that must not be collected.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Every read is "this account's devices".
    index("push_subscriptions_user_idx").on(t.userId),
    pgPolicy("push_subscriptions_owner", {
      for: "all",
      using: owner(),
      withCheck: owner(),
    }),
    // The sweep scans every account by definition, and the subscribe upsert
    // writes over a row held by the previous owner of the device. RLS cannot
    // express "take over a row you may not see", so both say so out loud.
    pgPolicy("push_subscriptions_server", {
      for: "all",
      using: server(),
      withCheck: server(),
    }),
  ],
).enableRLS();
