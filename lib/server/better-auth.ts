import "server-only";

/**
 * The Better Auth instance behind `auth.ts`'s seam — the only file that knows
 * which provider was chosen. See DESIGN.md §13.6. Lazy and memoised on
 * `globalThis` like `db.ts`, because this app must run with no `DATABASE_URL`.
 * No `nextCookies()` plugin: nothing here is a Server Action.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import { resolveBaseURL } from "./base-url";
import * as authSchema from "./auth-schema";
import { enqueueEmail, queueConfigured } from "./email-queue";
import { type EmailJob, mailerConfigured, sendEmail } from "../email";

/**
 * Queued where there is a queue, inline where there is not (§13.16). The await
 * means the same either way — *this much succeeded* — but on the queued branch
 * that is the hand-off, and the send happens where the request cannot see it.
 */
async function deliver(job: EmailJob): Promise<void> {
  return queueConfigured() ? enqueueEmail(job) : sendEmail(job);
}

const globalForAuth = globalThis as unknown as {
  // `ReturnType<typeof build>` rather than `ReturnType<typeof betterAuth>`:
  // Better Auth's return type is generic in the options it was given, and the
  // erased form is not assignable to the concrete one.
  openHabitsAuth?: ReturnType<typeof build>;
};

function build() {
  /**
   * Mandatory — *when a mailer exists to make it possible*. With no credentials
   * there is no link, so requiring the click would break sign-up entirely.
   */
  const verificationRequired = mailerConfigured();

  return betterAuth({
    /**
     * `sendOnSignIn` makes "resend" work without a second endpoint;
     * `autoSignInAfterVerification` because the click is the second factor, at
     * the cost of the session landing on whichever device opened the mail.
     *
     * Awaited: a serverless invocation can freeze the moment it returns. A
     * failure throws, which rolls the sign-up back and frees the address
     * (§13.10) — with a queue that means a failed *hand-off* (§13.16), and a
     * send that fails afterwards is retried and then parked in the DLQ.
     */
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await deliver({ kind: "verification", to: user.email, url });
        } catch (error) {
          console.error("[openhabits] verification email failed", error);
          if (verificationRequired) throw error;
        }
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },

    appName: "OpenHabits",

    /**
     * Signs the session cookie; rotating it invalidates every session.
     * `|| undefined` because `""` is a *present* secret to Better Auth, which
     * would sign cookies with it instead of refusing to start.
     */
    secret: process.env.BETTER_AUTH_SECRET || undefined,

    /**
     * Pinned, never inferred (§13.12): this origin is the one verification
     * links are mailed into, and inference takes it from a caller's header.
     */
    baseURL: resolveBaseURL(),

    database: drizzleAdapter(getDb(), {
      provider: "pg",
      // Explicit rather than the whole schema module: the adapter resolves
      // models by property name, and this app's own `users` table would
      // otherwise be a candidate for Better Auth's `user` model.
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
      },
    }),

    /**
     * A session is proof the mail was opened, so `resolveUser` needs no check
     * of its own. Recovering a typo'd address stays manual (§13.10).
     */
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: verificationRequired,

      /**
       * Password reset (§13.13). A failed send is swallowed, the opposite of
       * the verification mail: there the throw frees the address, here there is
       * nothing to roll back and surfacing the failure would make this the
       * account-enumeration oracle the endpoint is careful not to be.
       */
      sendResetPassword: async ({ user, url }) => {
        try {
          await deliver({ kind: "reset", to: user.email, url });
        } catch (error) {
          console.error("[openhabits] password reset email failed", error);
        }
      },

      /** Long enough to find the mail in spam, short enough not to be a standing key. */
      resetPasswordTokenExpiresIn: 3600,

      /**
       * Every existing session might not be theirs. The other devices are
       * signed out, not wiped: each takes a 401, clears the hint and keeps
       * every habit it holds in IndexedDB.
       */
      revokeSessionsOnPasswordReset: true,
    },
  });
}

export function getAuth(): ReturnType<typeof build> {
  // A local rather than `??=` and a re-read: a mutable property on a global is
  // not narrowed by the assignment, so the second read is `T | undefined`.
  const existing = globalForAuth.openHabitsAuth;
  if (existing) return existing;

  const auth = build();
  globalForAuth.openHabitsAuth = auth;
  return auth;
}

export type Auth = ReturnType<typeof getAuth>;
