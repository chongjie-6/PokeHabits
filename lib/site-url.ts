/**
 * The app's own public origin, for metadata. See DESIGN.md §8.6. Separate from
 * `server/base-url.ts`, which answers a security question and throws rather
 * than guess; this answers a cosmetic one, and a deployment with no accounts
 * still wants link previews. No `NEXT_PUBLIC_`: every read is server-side.
 */

/**
 * Vercel names the production domain without a scheme. A preview's own host is
 * deliberately not consulted: it outlives the deployment it names.
 */
function fromVercel(env: NodeJS.ProcessEnv): string | undefined {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : undefined;
}

/**
 * `localhost` is what Next infers with `metadataBase` unset; stating it keeps
 * the build silent, which §8.6 made a property worth having.
 */
export const FALLBACK_SITE_URL = "http://localhost:3000";

export function siteURL(env: NodeJS.ProcessEnv = process.env): URL {
  const candidate =
    env.SITE_URL?.trim() ||
    env.BETTER_AUTH_URL?.trim() ||
    fromVercel(env) ||
    FALLBACK_SITE_URL;

  try {
    return new URL(candidate);
  } catch {
    // A typo'd origin costs a wrong image URL in a preview, not a broken app.
    console.warn(
      `[openhabits] SITE_URL is not a valid URL (${candidate}); falling back.`,
    );
    return new URL(FALLBACK_SITE_URL);
  }
}
