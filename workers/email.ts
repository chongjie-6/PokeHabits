import "server-only";

/**
 * The mail queue's worker: what `POST /api/email` does. See DESIGN.md §13.16.
 * Shaped like `/api/cron/reminders` — fail closed with no secret, authenticate,
 * do bounded work — but a failure means something else here, since QStash
 * retries a non-2xx. The body is an envelope id: no link ever travels in it.
 */

import { Receiver } from "@upstash/qstash";
import { completeEmail, dequeueEmail } from "@/lib/server/email-queue";
import { readJson, readText } from "@/lib/server/json";
import { sendEmail } from "@/lib/email";

const NO_STORE = { "Cache-Control": "no-store" };

/** The body is `{ "id": "<uuid>" }`; anything near this size is not ours. */
const MAX_BODY_BYTES = 4 * 1024;

/** Checked, because it is concatenated into a Redis key. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function receiver(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function handleEmailJob(request: Request): Promise<Response> {
  /**
   * Unset is not "no authentication needed": this worker mails a link to an
   * address its own body names. `Receiver` directly rather than
   * `verifySignatureAppRouter`, so the gate is the first thing that happens.
   */
  const verifier = receiver();
  if (!verifier) {
    return json(503, {
      error:
        "QStash signing keys are not set; the mail queue worker is disabled.",
    });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) return json(401, { error: "Unauthorised." });

  // Read before the signature is checked, so bounded: until `verify` passes,
  // whoever sent this is anyone.
  const raw = await readText(request, MAX_BODY_BYTES);
  if (raw === null) return json(413, { error: "Body too large." });
  try {
    // `url` binds the signature to this endpoint.
    const valid = await verifier.verify({
      signature,
      body: raw,
      url: request.url,
    });
    if (!valid) return json(401, { error: "Unauthorised." });
  } catch {
    // A `SignatureError` and a malformed header are the same answer.
    return json(401, { error: "Unauthorised." });
  }

  const body = await readJson(raw);
  if (body === undefined)
    return json(400, { error: "Body is not valid JSON." });

  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !UUID_REGEX.test(id)) {
    return json(400, { error: "Malformed job." });
  }

  let job: Awaited<ReturnType<typeof dequeueEmail>>;
  try {
    job = await dequeueEmail(id);
  } catch (cause) {
    console.error("[openhabits] mail envelope read failed", cause);
    // The store, not the job: worth a retry.
    return json(500, { error: "Envelope store unavailable." });
  }

  /**
   * 200, and the branch that keeps a delivered mail out of the DLQ. A missing
   * envelope is either a retry after a lost response or a job whose hour ran
   * out — in which case its token had expired too.
   */
  if (!job) return json(200, { done: true, envelope: "gone" });

  try {
    await sendEmail(job);
  } catch (cause) {
    // The envelope is left in place so the retry has something to read.
    console.error(`[openhabits] queued ${job.kind} email failed`, cause);
    return json(500, { error: "Send failed." });
  }

  // Only now: until this line a retry is still possible, which is why
  // `dequeueEmail` reads rather than claims. Past it the mail has gone, so a
  // failed delete still answers 200 and the envelope's TTL tidies up.
  try {
    await completeEmail(id);
  } catch (cause) {
    console.error("[openhabits] mail envelope delete failed after send", cause);
  }

  return json(200, { done: true, kind: job.kind });
}
