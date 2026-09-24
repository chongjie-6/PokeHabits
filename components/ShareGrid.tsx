"use client";

import { useState } from "react";
import { renderShareCard, shareImage, type ShareCard } from "@/lib/share-card";

/**
 * A grid as an image, handed over. See DESIGN.md §4.6. Nothing happens until
 * the tap: drawing a year of cells on every visit to Stats would cost every
 * user a paint for a feature most never use. `busy` is a real state, `toBlob`
 * on a megapixel canvas being slow on a phone. The one place in the app that
 * awaits before something happens — §7.2's rule is about the tick.
 */
export function ShareGrid({
  card,
  filename,
}: {
  card: () => ShareCard;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const blob = await renderShareCard(card());
      if (!blob) {
        setResult("This browser can’t make the image.");
        return;
      }
      const how = await shareImage(blob, filename);
      setResult(how === "saved" ? "Image saved." : null);
    } catch (error) {
      console.error("openhabits: share failed", error);
      setResult("Couldn’t make the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {result && <span className="text-[11px] text-muted">{result}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-[12px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {busy ? "Making…" : "Share"}
      </button>
    </span>
  );
}
