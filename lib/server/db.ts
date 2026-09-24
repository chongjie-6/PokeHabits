import "server-only";

/**
 * The Postgres connection, shaped by running inside a serverless function.
 *
 * Cached on `globalThis` because route modules are re-evaluated across reloads
 * and cold starts, and a fresh pool per evaluation exhausts Postgres' limit.
 * A pool rather than one connection because an instance serves concurrent
 * requests and every scoped query holds its connection until it commits —
 * with one, a sign-in queues behind whichever sync is in flight. `prepare` is
 * off because prepared statements are per-session state and a pooler hands out
 * a different backend per checkout.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Sync is unavailable; see .env.example. " +
        "The app itself does not need it — IndexedDB remains the source of truth.",
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  openHabitsSql?: ReturnType<typeof postgres>;
};

function client(): ReturnType<typeof postgres> {
  globalForDb.openHabitsSql ??= postgres(connectionString(), {
    max: 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalForDb.openHabitsSql;
}

/** Lazy, or a build-time trace of the route fails with no `DATABASE_URL`. */
export function getDb() {
  return drizzle(client(), { schema });
}

export type Db = ReturnType<typeof getDb>;

/** Whether sync is configured at all. Used to answer honestly rather than 500. */
export function syncConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
