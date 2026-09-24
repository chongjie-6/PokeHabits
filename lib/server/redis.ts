import "server-only";

/**
 * The Upstash Redis handle, shaped like `lib/server/db.ts` (§13.17). None of
 * that file's pooling reasoning applies, and the resemblance should not invite
 * it: this client speaks HTTP, so the memoisation only avoids rebuilding an
 * object. Two optional consumers — the limiter and the mail queue.
 */

import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as unknown as {
  openHabitsRedis?: Redis;
};

function credentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not both set. " +
        "Rate limiting and the mail queue are unavailable; see .env.example.",
    );
  }
  return { url, token };
}

/**
 * Lazy like `getDb`: importing this must not require the credentials, or a
 * build-time trace of any route that touches it fails without them.
 */
export function getRedis(): Redis {
  const existing = globalForRedis.openHabitsRedis;
  if (existing) return existing;

  const { url, token } = credentials();
  // `automaticDeserialization` left on: both consumers store and read JSON.
  const redis = new Redis({ url, token });
  globalForRedis.openHabitsRedis = redis;
  return redis;
}

/**
 * Both halves, or neither is usable. `env` is a parameter because
 * `queueConfigured` folds this in, and that answer is worth testing alone.
 */
export function redisConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN)
  );
}
