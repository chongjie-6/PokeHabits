/**
 * The single undo slot. The two things worth pinning are an undo that fires
 * twice, restoring over a newer edit, and a stale timer dismissing the offer
 * that replaced the one it was scheduled for.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentOffer,
  dismiss,
  offerUndo,
  resetUndo,
  runUndo,
  UNDO_TTL_MS,
} from "@/lib/undo";

beforeEach(() => {
  vi.useFakeTimers();
  resetUndo();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("offerUndo", () => {
  it("holds the offer until something takes it", () => {
    offerUndo("Run deleted.", () => {});
    expect(currentOffer()?.message).toBe("Run deleted.");
  });

  it("expires on its own", () => {
    offerUndo("Run deleted.", () => {});
    vi.advanceTimersByTime(UNDO_TTL_MS);
    expect(currentOffer()).toBeNull();
  });

  it("replaces the standing offer rather than stacking", () => {
    offerUndo("first", () => {});
    offerUndo("second", () => {});
    expect(currentOffer()?.message).toBe("second");
  });

  it("does not let the replaced offer's timer dismiss the new one", () => {
    offerUndo("first", () => {});
    vi.advanceTimersByTime(UNDO_TTL_MS - 1);
    offerUndo("second", () => {});

    // The first offer's timer fires here; without the id guard it takes the
    // second offer with it, one millisecond after it appeared.
    vi.advanceTimersByTime(1);
    expect(currentOffer()?.message).toBe("second");

    vi.advanceTimersByTime(UNDO_TTL_MS);
    expect(currentOffer()).toBeNull();
  });
});

describe("runUndo", () => {
  it("runs the action and clears the offer", () => {
    const undo = vi.fn();
    offerUndo("Run deleted.", undo);

    runUndo();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(currentOffer()).toBeNull();
  });

  it("runs at most once, however many times it is tapped", () => {
    const undo = vi.fn();
    offerUndo("Run deleted.", undo);

    runUndo();
    runUndo();

    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no offer", () => {
    expect(() => runUndo()).not.toThrow();
  });

  it("cannot be run after it expires", () => {
    const undo = vi.fn();
    offerUndo("Run deleted.", undo);
    vi.advanceTimersByTime(UNDO_TTL_MS);

    runUndo();
    expect(undo).not.toHaveBeenCalled();
  });
});

describe("dismiss", () => {
  it("drops the offer without running it", () => {
    const undo = vi.fn();
    offerUndo("Run deleted.", undo);

    dismiss();

    expect(undo).not.toHaveBeenCalled();
    expect(currentOffer()).toBeNull();
  });

  it("is safe with nothing standing", () => {
    expect(() => dismiss()).not.toThrow();
  });
});
