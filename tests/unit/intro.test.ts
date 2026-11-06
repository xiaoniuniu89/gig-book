// The playalong plays an intro once: later choruses start at the top of the form (where the walking comes in).
import { describe, expect, it } from "vitest";
import { introLength } from "@/lib/band/engine";

const bars = (...s: (string | null)[]) => s.map(section => ({ section }));

describe("introLength", () => {
  it("counts the bars before the first real section", () => {
    expect(introLength(bars("i", null, null, null, "A", null, "B"))).toBe(4);
  });
  it("is 0 with no intro, or when the intro is the whole tune", () => {
    expect(introLength(bars("A", null, "B"))).toBe(0);
    expect(introLength(bars("i", null, null))).toBe(0);
    expect(introLength([])).toBe(0);
  });
});
