import "server-only";

/**
 * Outbound mail, handed to QStash instead of awaited. See DESIGN.md §13.16.
 * Which implementation runs is a property of the deployment, never of the
 * caller, and with nothing set this file may as well not exist.
 *
 * **The link never enters a QStash body**, which is retained, because a
 * verification link is a session (§13.12): the envelope goes to Redis under a
 * random id with an hour's TTL and the message carries only the id.
 */

import { Client } from "@upstash/qstash";
import { mailableOrigin } from "./base-url";
import { getRedis, redisConfigured } from "./redis";
import { siteURL } from "../site-url";
import { type EmailJob, isEmailKind } from "../email";

/** Matching `resetPasswordTokenExpiresIn`: a longer-lived envelope only mails a dead link. */
const ENVELOPE_TTL_SECONDS = 3600;

const QUEUE_NAME = "email";
const KEY_PREFIX = "openhabits:email:";

/** RFC 5321's limit on a path, which is the longest an address may be. */
const MAX_ADDRESS = 320;
const MAX_URL = 2048;

/** A send that has failed three times fails for a reason retrying will not fix. */
const RETRIES = 3;

const globalForQueue = globalThis as unknown as {
  openHabitsQStash?: Client;
};

/**
 * `baseUrl` is passed rather than defaulted because the SDK's default *is*
 * eu-central-1, and a token from another region gets a 404 that reads like a
 * bad token and is not one. `QSTASH_URL` is handed out beside the token.
 */
function client(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error(
      "QSTASH_TOKEN is not set. The mail queue is unavailable; see .env.example. " +
        "Mail is sent inline without it, which is what this app did before the queue existed.",
    );
  }
  const baseUrl = process.env.QSTASH_URL;
  globalForQueue.openHabitsQStash ??= new Client(
    baseUrl ? { token, baseUrl } : { token },
  );
  return globalForQueue.openHabitsQStash;
}

/** Where QStash calls back; `siteURL()` already answers what this origin is. */
export function workerURL(env: NodeJS.ProcessEnv = process.env): URL {
  return new URL("/api/email", siteURL(env));
}

function reachable(url: URL): boolean {
  return (
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "[::1]"
  );
}

/**
 * The third condition is the one that surprises: QStash delivers over HTTP from
 * its own network, so it cannot reach a laptop, and a development machine with
 * a real token would fill the DLQ while no mail arrived. Localhost is inline.
 */
export function queueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean(env.QSTASH_TOKEN) &&
    redisConfigured(env) &&
    reachable(workerURL(env))
  );
}

function isString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/**
 * Validated on the way out *and* back in: the re-check is what stands between a
 * compromised envelope store and this app mailing a branded link into someone
 * else's origin (§13.12). Hand-rolled, there being no schema library here.
 */
export function parseEmailJob(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): EmailJob | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const job = value as Record<string, unknown>;

  if (!isEmailKind(job.kind)) return null;
  if (!isString(job.to, MAX_ADDRESS)) return null;
  if (!isString(job.url, MAX_URL)) return null;
  if (!mailableOrigin(job.url, env)) return null;

  return { kind: job.kind, to: job.to, url: job.url };
}

/**
 * A hand-off, not a send, and the distinction matters: a failure here is a
 * failure to accept the job at all, which still rolls the sign-up back.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  const id = crypto.randomUUID();

  // The envelope first, or QStash delivers before the worker has anything to read.
  await getRedis().set(`${KEY_PREFIX}${id}`, job, { ex: ENVELOPE_TTL_SECONDS });

  try {
    await client().queue({ queueName: QUEUE_NAME }).enqueueJSON({
      url: workerURL().toString(),
      body: { id },
      retries: RETRIES,
    });
  } catch (cause) {
    // Nothing will read this envelope, and it holds a live link for an hour.
    // Dropping it also makes an orphan evidence of a lost send rather than of a
    // rejected hand-off, which is the only signal that tells the two apart.
    await getRedis()
      .del(`${KEY_PREFIX}${id}`)
      .catch(() => {});
    throw cause;
  }
}

/**
 * Read, deliberately **not** claimed — the opposite of `server/reminders.ts`,
 * where a retry is the thing to prevent and here it is the whole point. The
 * cost is a duplicate in the inbox when a 200 is lost, against a link that
 * never arrives at all.
 */
export async function dequeueEmail(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmailJob | null> {
  const stored = await getRedis().get<unknown>(`${KEY_PREFIX}${id}`);
  if (stored === null || stored === undefined) return null;
  return parseEmailJob(stored, env);
}

/** Only after a successful send: a missing key is how a retry knows the mail went. */
export async function completeEmail(id: string): Promise<void> {
  await getRedis().del(`${KEY_PREFIX}${id}`);
}
