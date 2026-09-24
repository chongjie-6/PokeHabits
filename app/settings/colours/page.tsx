"use client";

import Link from "next/link";
import { PaletteEditor } from "@/components/PaletteEditor";
import { useOpenHabits } from "@/lib/store";

/**
 * The editor reads `localStorage` and the resolved theme, neither of which
 * exists at prerender, so it sits behind the store's hydration gate (§7.1) —
 * which here is only the app's answer to "are we on the client yet".
 */
export default function ColoursPage() {
  const { hydrated } = useOpenHabits();

  return (
    <div className="space-y-4">
      <Link
        href="/settings"
        className="inline-flex min-h-11 items-center text-[13px] text-muted transition-colors hover:text-foreground"
      >
        ‹ Settings
      </Link>
      {hydrated ? <PaletteEditor /> : <Skeleton />}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-20 rounded bg-surface-2" />
      <div className="h-28 rounded-card bg-surface-2" />
      <div className="h-64 rounded-card bg-surface-2" />
    </div>
  );
}
