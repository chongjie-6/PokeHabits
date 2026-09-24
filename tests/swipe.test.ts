import { describe, expect, it } from "vitest";
import { resolveSwipe } from "@/lib/use-swipe";

describe("resolveSwipe", () => {
  it("reads direction from the sign of the horizontal travel", () => {
    expect(resolveSwipe(-120, 0, 200)).toBe("left");
    expect(resolveSwipe(120, 0, 200)).toBe("right");
  });

  it("treats anything short of the threshold as a tap", () => {
    expect(resolveSwipe(39, 0, 200)).toBeNull();
    expect(resolveSwipe(-39, 0, 200)).toBeNull();
    expect(resolveSwipe(0, 0, 0)).toBeNull();
    expect(resolveSwipe(40, 0, 200)).toBe("right");
  });

  it("lets a habit list scroll: vertical travel disqualifies the gesture", () => {
    expect(resolveSwipe(100, 61, 200)).toBeNull();
    expect(resolveSwipe(-100, -61, 200)).toBeNull();
  });

  it("tolerates the sideways drift of a thumb dragging down a list", () => {
    expect(resolveSwipe(100, 40, 200)).toBe("right");
  });

  it("rejects a slow drag", () => {
    expect(resolveSwipe(200, 0, 801)).toBeNull();
    expect(resolveSwipe(200, 0, 800)).toBe("right");
  });

  it("drops the clock for a gesture that followed the finger", () => {
    expect(resolveSwipe(200, 0)).toBe("right");
    expect(resolveSwipe(39, 0)).toBeNull();
    expect(resolveSwipe(100, 61)).toBeNull();
  });
});
