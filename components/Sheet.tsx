"use client";

import { useEffect, useRef } from "react";

/**
 * A bottom sheet on the platform's modal dialog (§6.7). `showModal()` buys the
 * focus trap, Escape, the inert background and the top layer, and a div with a
 * backdrop has to reimplement all four — usually missing the ones a screen
 * reader depends on. Everything here is shape and motion on top of that.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const startedOnBackdrop = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      element.showModal();
      // The dialog's own focusing steps land on the first field, which on touch
      // raises the keyboard over a sheet pinned to the bottom edge.
      dismiss.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      data-slot="sheet"
      aria-label={title}
      // Fires for Escape too, so it is the only place to put the parent back.
      onClose={onClose}
      // Both ends have to be on the backdrop: a drag off the end of a range
      // slider delivers a click targeting the dialog, and dismissing there
      // throws the form away for setting a slider to its maximum.
      onPointerDown={(event) => {
        startedOnBackdrop.current = event.target === dialog.current;
      }}
      onClick={(event) => {
        if (startedOnBackdrop.current && event.target === dialog.current)
          onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto flex max-h-[85dvh] min-h-[75dvh] w-full max-w-lg flex-col overflow-hidden bg-surface p-0 text-foreground surface-sheet"
    >
      <div className="flex items-start justify-between gap-4 px-4 pt-4">
        <h2 className="display-type text-[15px]">{title}</h2>
        <button
          ref={dismiss}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-foreground"
        >
          &#x2715;
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-safe">
        {children}
      </div>
    </dialog>
  );
}
