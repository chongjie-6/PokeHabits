"use client";

import { dismiss, runUndo, useUndoOffer } from "@/lib/undo";

/**
 * The standing undo offer, if there is one. See DESIGN.md §7.4. Mounted in the
 * root layout, because the action worth undoing is usually the last thing done
 * on a screen before leaving it — a bar owned by that screen would unmount with
 * it, taking the only way back. It sits above the tab bar, so ignoring the
 * offer costs nothing, and `role="status"` rather than `alert`, since this is
 * the outcome of something the user just did.
 */
export function UndoBar() {
  const offer = useUndoOffer();
  if (!offer) return null;

  return (
    <div
      role="status"
      // Keyed on the offer, so a second one restarts the entrance rather than
      // swapping its text.
      key={offer.id}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+4.5rem)]"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
        <p className="min-w-0 flex-1 truncate text-[13px]">{offer.message}</p>
        <button
          type="button"
          onClick={runUndo}
          className="h-9 shrink-0 rounded-control px-3 text-[13px] font-semibold text-accent transition-colors hover:bg-surface-2"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
