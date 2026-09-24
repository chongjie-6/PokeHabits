/**
 * Row-level security against real Postgres and — the part that matters — as a
 * role that is not the tables' owner (§13.15). A superuser ignores every policy
 * silently, so the other server tests would pass against a schema with `0006`
 * reverted; this one creates an ordinary role and `SET ROLE`s into it.
 *
 * Which is the deployment note too: point `DATABASE_URL` at a role like this,
 * or everything below passes while the running app is protected by nothing.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/server/db";
import { runReminderSweep } from "@/lib/server/reminders";
import * as schema from "@/lib/server/schema";
import { asServer, asUser } from "@/lib/server/scope";
import { runSync } from "@/lib/server/sync-store";
import { DEFAULT_SETTINGS, type Habit } from "@/lib/types";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

function migrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
}

const ALICE = { id: "alice", email: "alice@example.com" };
const BOB = { id: "bob", email: "bob@example.com" };

/** 23:00Z is 09:00 next morning in Sydney — the same fixture the sweep test uses. */
const NINE_IN_SYDNEY = new Date("2026-09-04T23:00:00Z");

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
    updatedAt: 1,
    deletedAt: null,
    ...over,
  };
}

let db: Db;
let pglite: PGlite;

beforeEach(async () => {
  pglite = new PGlite();

  for (const statements of migrations()) {
    for (const statement of statements.split("--> statement-breakpoint")) {
      if (statement.trim()) await pglite.exec(statement);
    }
  }

  // Seeded as the owner, before the role switch: two accounts with habits,
  // entries, preferences and a device each. Everything after this point runs as
  // the app would run it.
  for (const user of [ALICE, BOB]) {
    await pglite.query(`insert into users (id, email) values ($1, $2)`, [
      user.id,
      user.email,
    ]);
    await pglite.query(
      `insert into habits (user_id, id, name, emoji, color, cadence, target, "order",
         created_at, archived_at, updated_at, deleted_at, seq)
       values ($1, $2, $2, '✅', 'green', '{"kind":"daily"}', 1, 0, '2026-08-01', null, 1, null,
         nextval('hapi_sync_seq'))`,
      [user.id, `${user.id}-habit`],
    );
    await pglite.query(
      `insert into entries (user_id, habit_id, date, count, updated_at, seq)
       values ($1, $2, '2026-09-01', 1, 1, nextval('hapi_sync_seq'))`,
      [user.id, `${user.id}-habit`],
    );
    await pglite.query(
      `insert into settings (user_id, value, updated_at, seq)
       values ($1, $2, 1, nextval('hapi_sync_seq'))`,
      [user.id, JSON.stringify({ ...DEFAULT_SETTINGS, reminderHour: 9 })],
    );
    await pglite.query(
      `insert into push_subscriptions (endpoint, user_id, p256dh, auth, time_zone)
       values ($1, $2, 'p', 'a', 'Australia/Sydney')`,
      [`https://push.example/${user.id}`, user.id],
    );
  }

  await pglite.exec(`
    create role openhabits_app login;
    grant usage on schema public to openhabits_app;
    grant select, insert, update, delete on all tables in schema public to openhabits_app;
    grant usage, select on all sequences in schema public to openhabits_app;
    set role openhabits_app;
  `);

  db = drizzle(pglite, { schema }) as unknown as Db;
});

async function rows(query: string, params: unknown[] = []): Promise<unknown[]> {
  const result = await pglite.query(query, params);
  return result.rows;
}

/** Drizzle's `execute` hands back a result object rather than the rows. */
function returned(result: unknown): unknown[] {
  return (result as { rows: unknown[] }).rows;
}

/**
 * Drizzle wraps a driver error in one whose message is the SQL it tried, so
 * `toThrow` alone would pass against a syntax error as happily as a policy.
 */
async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause)
      messages.push(e.message);
    return messages.join(" — ");
  }
  throw new Error("the statement was allowed, and should not have been");
}

describe("the role the app connects as", () => {
  it("is not a superuser, which would bypass every policy silently", async () => {
    const [role] = (await rows(
      `select current_user, current_setting('is_superuser') as su`,
    )) as {
      current_user: string;
      su: string;
    }[];
    expect(role.current_user).toBe("openhabits_app");
    expect(role.su).toBe("off");
  });

  it("finds RLS enabled *and* forced on every table holding account data", async () => {
    const tables = (await rows(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by relname`,
    )) as {
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }[];

    // Enumerated rather than spot-checked: a new table added to `schema.ts`
    // without a policy fails here, which is the only moment anyone would notice.
    expect(tables.map((t) => t.relname)).toEqual([
      "entries",
      "habits",
      "push_subscriptions",
      "settings",
      "users",
    ]);
    // `relforcerowsecurity` is the half drizzle-kit cannot generate, so it is
    // also the half a regenerated migration would quietly drop.
    expect(tables.every((t) => t.relrowsecurity && t.relforcerowsecurity)).toBe(
      true,
    );
  });
});

describe("with no scope open", () => {
  it("reads nothing at all", async () => {
    expect(await rows(`select * from habits`)).toEqual([]);
    expect(await rows(`select * from entries`)).toEqual([]);
    expect(await rows(`select * from settings`)).toEqual([]);
    expect(await rows(`select * from users`)).toEqual([]);
    expect(await rows(`select * from push_subscriptions`)).toEqual([]);
  });

  it("refuses to write", async () => {
    await expect(
      rows(
        `insert into users (id, email) values ('mallory', 'mallory@example.com')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("inside one account's scope", () => {
  it("cannot see another account's rows, asked for by name", async () => {
    const seen = await asUser(db, ALICE.id, async (tx) => ({
      // The `where` is deliberately Bob's. This is the query a refactor that
      // dropped a `userId` filter would produce, and the policy is what stands
      // between that bug and a data leak.
      habits: await tx.execute(
        sql`select id from habits where user_id = 'bob'`,
      ),
      entries: await tx.execute(
        sql`select date from entries where user_id = 'bob'`,
      ),
      settings: await tx.execute(
        sql`select value from settings where user_id = 'bob'`,
      ),
    }));

    expect(returned(seen.habits)).toEqual([]);
    expect(returned(seen.entries)).toEqual([]);
    expect(returned(seen.settings)).toEqual([]);
  });

  it("sees an unfiltered query as its own rows only", async () => {
    const all = await asUser(db, ALICE.id, (tx) =>
      tx.execute(sql`select id from habits`),
    );
    expect(returned(all)).toEqual([{ id: "alice-habit" }]);
  });

  it("cannot write a row belonging to someone else", async () => {
    const message = await refusal(
      asUser(db, ALICE.id, (tx) =>
        tx.execute(sql`
          insert into habits (user_id, id, name, emoji, color, cadence, target, "order",
            created_at, archived_at, updated_at, deleted_at, seq)
          values ('bob', 'planted', 'planted', '✅', 'green', '{"kind":"daily"}', 1, 0,
            '2026-08-01', null, 2, null, nextval('hapi_sync_seq'))`),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("cannot move one of its own rows into another account", async () => {
    const message = await refusal(
      asUser(db, ALICE.id, (tx) =>
        tx.execute(sql`update habits set user_id = 'bob'`),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("cannot delete another account's rows", async () => {
    await asUser(db, ALICE.id, (tx) => tx.execute(sql`delete from habits`));
    const survivors = await asUser(db, BOB.id, (tx) =>
      tx.execute(sql`select id from habits`),
    );
    expect(returned(survivors)).toEqual([{ id: "bob-habit" }]);
  });
});

describe("the server scope", () => {
  it("reaches devices and preferences, which the sweep needs", async () => {
    const seen = await asServer(db, async (tx) => ({
      devices: await tx.execute(
        sql`select endpoint from push_subscriptions order by endpoint`,
      ),
      settings: await tx.execute(
        sql`select user_id from settings order by user_id`,
      ),
    }));

    expect(returned(seen.devices)).toHaveLength(2);
    expect(returned(seen.settings)).toHaveLength(2);
  });

  it("reaches no habit, no entry and no account row", async () => {
    const seen = await asServer(db, async (tx) => ({
      habits: await tx.execute(sql`select id from habits`),
      entries: await tx.execute(sql`select date from entries`),
      users: await tx.execute(sql`select id from users`),
    }));

    // The point of the scope existing at all: it answers "which devices are
    // due", and cannot be talked into answering "what is everyone tracking".
    expect(returned(seen.habits)).toEqual([]);
    expect(returned(seen.entries)).toEqual([]);
    expect(returned(seen.users)).toEqual([]);
  });

  it("cannot write a preference, only read one", async () => {
    // A `select`-only policy makes an update match no rows rather than raise —
    // Postgres has nothing to refuse, because from here there is nothing there
    // to update. So the assertion is on what survived, not on an error.
    await asServer(db, (tx) =>
      tx.execute(sql`update settings set updated_at = 99`),
    );

    const after = await asUser(db, ALICE.id, (tx) =>
      tx.execute(sql`select updated_at from settings`),
    );
    expect(returned(after)).toEqual([{ updated_at: 1 }]);
  });
});

describe("the paths that run in production", () => {
  it("hands a sync only its own account's rows", async () => {
    const pull = await runSync(db, BOB, {
      accountId: null,
      since: 0,
      habits: [habit("bobs-new-one", { updatedAt: 10 })],
      entries: [],
      settings: null,
    });

    expect(pull.habits.map((h) => h.id).sort()).toEqual([
      "bob-habit",
      "bobs-new-one",
    ]);
    expect(pull.entries.every((e) => e.habitId.startsWith("bob"))).toBe(true);
  });

  it("still delivers a reminder, which needs both scopes in one pass", async () => {
    const sent: string[] = [];
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: async (target) => {
        sent.push(target.endpoint);
        return "sent";
      },
    });

    expect(summary.considered).toBe(2);
    expect(summary.sent).toBe(2);
    // Each account's outstanding habit was read under its own scope, so a
    // reminder that named the wrong person's habit would be a different count.
    expect(sent.sort()).toEqual([
      "https://push.example/alice",
      "https://push.example/bob",
    ]);
  });

  it("cannot take an endpoint over from inside the owning scope, which is why the subscribe upsert uses asServer", async () => {
    // `app/api/reminders/route.ts` explains the choice; this is the failure it
    // is avoiding. Bob's device is invisible to Alice, and `on conflict do
    // update` against a row the policy hides is an error, not a no-op.
    const message = await refusal(
      asUser(db, ALICE.id, (tx) =>
        tx.execute(sql`
          insert into push_subscriptions (endpoint, user_id, p256dh, auth, time_zone)
          values ('https://push.example/bob', 'alice', 'p', 'a', 'Australia/Sydney')
          on conflict (endpoint) do update set user_id = 'alice'`),
      ),
    );
    expect(message).toMatch(/row-level security/);

    await asServer(db, (tx) =>
      tx.execute(sql`
        insert into push_subscriptions (endpoint, user_id, p256dh, auth, time_zone)
        values ('https://push.example/bob', 'alice', 'p', 'a', 'Australia/Sydney')
        on conflict (endpoint) do update set user_id = 'alice'`),
    );

    const mine = await asUser(db, ALICE.id, (tx) =>
      tx.execute(
        sql`select endpoint from push_subscriptions order by endpoint`,
      ),
    );
    expect(returned(mine)).toHaveLength(2);
  });
});
