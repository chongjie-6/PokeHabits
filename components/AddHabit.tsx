"use client";

import { useState } from "react";
import { HabitFormPanel } from "@/components/HabitFormPanel";
import { addHabit } from "@/lib/store";
import { MOBILE, useMediaQuery } from "@/lib/use-media-query";

export function AddHabit() {
  const [open, setOpen] = useState(false);
  // Bumped on the way in, never out: the sheet animating out keeps its
  // contents, and a half-filled draft is gone by the next open.
  const [instance, setInstance] = useState(0);
  const sheet = useMediaQuery(MOBILE);

  return (
    <>
      {/* The inline form takes the button's place, as it always has. The sheet
          floats over the page, so the button stays where it is underneath. */}
      {(sheet || !open) && (
        <button
          type="button"
          onClick={() => {
            setInstance((n) => n + 1);
            setOpen(true);
          }}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 control-dashed text-[14px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          New habit
        </button>
      )}

      <HabitFormPanel
        sheet={sheet}
        open={open}
        onClose={() => setOpen(false)}
        title="New habit"
        instance={instance}
        className="mt-3"
        submitLabel="Add habit"
        onSubmit={(values) => {
          addHabit(values);
          setOpen(false);
        }}
      />
    </>
  );
}
