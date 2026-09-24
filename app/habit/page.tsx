import type { Metadata } from "next";
import { Suspense } from "react";
import { HabitDetail } from "@/components/HabitDetail";

export const metadata: Metadata = {
  title: "Habit",
  description:
    "One habit's own year — its heatmap, current and longest streak, cadence, and archive controls.",
  robots: { index: false, follow: false },
};

/**
 * `/habit?id=…` rather than `/habit/[id]`: habit ids are client-generated
 * UUIDs, so a dynamic segment could not be prerendered and opening one offline
 * would fail unless the worker had cached that exact URL.
 */
export default function HabitPage() {
  return (
    <Suspense fallback={null}>
      <HabitDetail />
    </Suspense>
  );
}
