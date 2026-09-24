import type { Metadata } from "next";

const DESCRIPTION =
  "Theme, week start, your habit list, and a full JSON export or import of your data.";

export const metadata: Metadata = {
  title: "Settings",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Settings · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return children;
}
