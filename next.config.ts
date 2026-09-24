import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the app itself. See DESIGN.md §8.7.
 *
 * **`script-src` carries `'unsafe-inline'` deliberately.** Three scripts are
 * inlined into every prerendered document, and neither way out is available: a
 * nonce needs per-request rendering, and `public/sw.js` would cache one and
 * mismatch it next load; hashes cannot name Next's per-build flight scripts.
 * What is left still pays for itself, `connect-src 'self'` above all — injected
 * script can run, but it cannot post a year of habits anywhere.
 *
 * `style-src` keeps `'unsafe-inline'` for Next's own error documents; this
 * app's pages ship neither a `<style>` block nor a style attribute.
 * `'unsafe-eval'` is added **only under `next dev`**, where React's development
 * build evaluates source text, which is why it is keyed off `NODE_ENV` rather
 * than written into the constant. `frame-ancestors` names the author's
 * portfolio and nothing else, with no `X-Frame-Options` beside it: that header
 * cannot allow one other site, and a browser seeing both obeys this one.
 */
const dev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://chongjie.vercel.app",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Connectivity detection for `lib/sync/client.ts`. It does **not** retry
     * sync — that stays hand-rolled, `POST /api/sync` being a plain fetch. What
     * it buys is a truthful answer to "are we offline", where
     * `navigator.onLine` says true on wifi with no route to the internet.
     */
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      {
        // The worker must never be served stale, or a bad one pins itself.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
