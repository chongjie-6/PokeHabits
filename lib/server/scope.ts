import "server-only";

/**
 * The other half of row-level security (§13.15): the only way to reach a
 * replicated table, because the policies compare rows to a setting only these
 * functions open. **Transaction-local, always** — the third argument to
 * `set_config` — since `db.ts` pools connections across concurrent requests,
 * where a session-scoped identity is another request's identity. It fails
 * closed: an unset setting is NULL and an untrue policy denies the row. The
 * `where user_id = …` clauses stay; RLS is the backstop for the day one goes.
 */

import { sql } from "drizzle-orm";
import type { Db } from "./db";

/** The transaction handle Drizzle hands a callback. Every query runs on one. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Everything inside sees exactly that account's rows, and can write no others. */
export function asUser<T>(
  db: Db,
  userId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('openhabits.user_id', ${userId}, true)`,
    );
    return work(tx);
  });
}

/**
 * No account: the scope the reminder sweep and the subscribe upsert need, and
 * nothing else should. It reaches `push_subscriptions` and reads `settings`;
 * every call site owes a comment saying why it cannot name an account.
 */
export function asServer<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('openhabits.scope', 'server', true)`,
    );
    return work(tx);
  });
}
