"use client";

import { createContext, useContext, useState } from "react";

/**
 * The browsed day as an offset from today (§6.8), not a DayKey, so the page
 * still rolls over at midnight. Held above the page's slots, the strip and the
 * list sitting in different ones that a skin may reorder.
 */
type BrowseDay = {
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
};

const Context = createContext<BrowseDay | null>(null);

export function BrowseDayProvider({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  return (
    <Context.Provider value={{ offset, setOffset }}>
      {children}
    </Context.Provider>
  );
}

export function useBrowseDay(): BrowseDay {
  const value = useContext(Context);
  if (!value) throw new Error("useBrowseDay needs a BrowseDayProvider");
  return value;
}
