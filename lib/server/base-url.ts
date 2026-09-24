import "server-only";

/**
 * Where Better Auth believes it is hosted. See DESIGN.md §13.12. Alone in a
 * file with no imports, so the rule is testable without an auth stack.
 *
 * Unset, Better Auth infers the origin from the `Host` header — and that origin
 * is what verification links are built from, while `send-verification-email`
 * accepts any address with no session. A forged `Host` would make this app mail
 * a genuine, branded link into somebody else's server. So production must say.
 */

/** `env` is a parameter so the production branch is testable in isolation. */
export function resolveBaseURL(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const url = env.BETTER_AUTH_URL?.trim() || undefined;
  if (url) return url;

  if (env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_URL is not set. Accounts have to know their own public URL: " +
        "without it, Better Auth takes the origin from the request's Host header, " +
        "and mails verification links to wherever that points. See .env.example. " +
        "Habits, sync and the rest of the app are unaffected.",
    );
  }

  return undefined;
}

/**
 * Whether this deployment could itself have produced a link at `candidate`. See
 * §13.16: the queue writes a verification URL to Redis and the worker reads it
 * back, which is a second place that could be made to name an origin this app
 * does not own — so a compromised envelope store buys a refused send rather
 * than a phishing relay. Here because this module owns the question.
 */
export function mailableOrigin(
  candidate: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin === url.origin;
    } catch {
      return false;
    }
  }

  // Production already threw on the way in, so this is development.
  if (env.NODE_ENV === "production") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}
