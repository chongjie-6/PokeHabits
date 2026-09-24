/**
 * POST /api/email — the mail queue's entry point, called by a machine rather
 * than a client. See DESIGN.md §13.16. The worker is `workers/email.ts`; this
 * file holds only what Next.js reads statically from a route segment.
 */

import { handleEmailJob } from "@/workers/email";

/** `nodemailer` opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";

/** Reads the environment and a store per request. */
export const dynamic = "force-dynamic";

/** Stated so a hung relay is killed by the platform rather than by nothing. */
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleEmailJob(request);
}
