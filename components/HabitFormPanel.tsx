"use client";

import { HabitForm, type HabitFormValues } from "@/components/HabitForm";
import { Sheet } from "@/components/Sheet";

/**
 * The habit form in its two presentations (§6.7). Touch gets a bottom sheet; a
 * pointer keeps the inline card, a sheet clamped to a 1400px window being a
 * phone idiom in the wrong room. The caller decides and passes the answer down,
 * since it has to know anyway: the inline form takes the place of its opener.
 */
export function HabitFormPanel({
  sheet,
  open,
  onClose,
  title,
  instance,
  className = "",
  initial,
  submitLabel,
  onSubmit,
}: {
  sheet: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Bumped by the caller on open; see the sheet branch for why. */
  instance: number;
  /** Applied to the inline card only — the sheet is positioned by the viewport. */
  className?: string;
  initial?: Partial<HabitFormValues>;
  submitLabel: string;
  onSubmit: (values: HabitFormValues) => void;
}) {
  if (!sheet) {
    if (!open) return null;
    // Unmounted between edits, so it resets on its own. Cancel is the only way
    // out here: no backdrop, no Escape.
    return (
      <div className={`surface-card bg-surface p-4 ${className}`}>
        <HabitForm
          autoFocus
          initial={initial}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* The sheet stays mounted while it animates out, so the form cannot
          reset by unmounting — `instance` remounts it on the way in instead. */}
      <HabitForm
        key={instance}
        initial={initial}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
      />
    </Sheet>
  );
}
