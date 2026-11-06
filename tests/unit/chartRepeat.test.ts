// An empty bar on the chart: % when it repeats the bar before, the chord's name when that bar had two chords.
import { describe, expect, it } from "vitest";
import { chartHTML } from "@/lib/chart";
import { song } from "@/lib/songs";
import type { Song } from "@/lib/ireal";

const base = song("irealbook://Held=Test=Medium Swing=C=n=[T44D7   |C7   ]");
const held = (bars: string[][]): Song => {
  const b0 = base.bars[0], ch0 = b0.chords[0];
  const chords = (names: string[]) => names.map((root, k) => ({ ...ch0, root, beat: k * 2, cont: false }));
  return { ...base, bars: bars.map((names, i) => ({ ...b0, section: i ? null : b0.section,
    chords: names.length ? chords(names) : [{ ...ch0, root: bars[i - 1].at(-1)!, beat: 0, cont: true }] })) };
};
const opts = { shift: 0, mode: "trad", sc: false, tn: false, fn: false } as Parameters<typeof chartHTML>[1];
const count = (html: string, s: string) => html.split(s).length - 1;

describe("empty bars on the chart", () => {
  it("show % after a one-chord bar", () => {
    const html = chartHTML(held([["D"], [], ["C"]]), opts);
    expect(count(html, '<span class="ch sim">%</span>')).toBe(1);
    expect(html).not.toContain('<span class="ch sim">·</span>');
  });
  it("name the held chord after a two-chord bar, since % would repeat both", () => {
    const html = chartHTML(held([["C", "F"], []]), opts);
    expect(count(html, '<span class="ch sim">%</span>')).toBe(0);
  });
});
