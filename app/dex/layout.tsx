import type { Metadata } from "next";

const DESCRIPTION =
  "Every good week discovers a new creature. See who you have found, and how this week is going.";

export const metadata: Metadata = {
  title: "Creatures",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Creatures · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function DexLayout({ children }: LayoutProps<"/dex">) {
  return children;
}
