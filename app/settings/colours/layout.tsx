import type { Metadata } from "next";

const DESCRIPTION =
  "Build the app a palette of its own from one colour, or set all twenty tokens by hand, with contrast measured as you go.";

export const metadata: Metadata = {
  title: "Colours",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Colours · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function ColoursLayout({
  children,
}: LayoutProps<"/settings/colours">) {
  return children;
}
