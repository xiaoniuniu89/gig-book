// Hits and the drummer view (R3.6): validation, the chart drawing and what the band does with them.
import { describe, expect, it } from "vitest";
import { encodeSong, parseProgression, progressionMusic } from "@/lib/irealExport";
import { song } from "@/lib/songs";
import { chartHTML } from "@/lib/chart";
import { MAX_HITS, defaultFeel, stopAt, toggleHit, validateFeels, validateHits, type Hit } from "@/lib/hits";
import { shapeBar } from "@/lib/band/hitplay";
import { Generator } from "@/lib/band/gen";

const sg = song(encodeSong({ title: "Hit Tune", key: "C", music: progressionMusic(parseProgression("Dm7 | G7 | Cmaj7 | Cmaj7")), tempo: 120 }));

describe("lib/hits", () => {
  it("keeps good marks and drops bad ones", () => {
    const h = validateHits([
      { bar: 1, eighth: 3, kind: "hit" }, { bar: 1, eighth: 3, kind: "hit" }, { bar: 9, eighth: 0, kind: "hit" },
      { bar: 0, eighth: 8, kind: "hit" }, { bar: 0, eighth: 0, kind: "boom" }, { bar: 2, eighth: 0, kind: "stop", until: 99 }, "x",
    ], 4);
    expect(h).toEqual([{ bar: 1, eighth: 3, kind: "hit" }, { bar: 2, eighth: 0, kind: "stop", until: 3 }]);
    expect(validateHits("no", 4)).toEqual([]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ bar: i % 100, eighth: i % 8, kind: "hit" }));
    expect(validateHits(many, 100).length).toBeLessThanOrEqual(MAX_HITS);
  });
  it("toggles a mark on and off", () => {
    const h: Hit = { bar: 0, eighth: 1, kind: "hit" };
    expect(toggleHit([], h)).toEqual([h]);
    expect(toggleHit([h], h)).toEqual([]);
  });
  it("finds the stop that covers a bar", () => {
    const hs: Hit[] = [{ bar: 1, eighth: 0, kind: "stop", until: 2 }];
    expect(stopAt(hs, 2)).toBeTruthy();
    expect(stopAt(hs, 3)).toBeUndefined();
  });
  it("reads feels and the default from the style", () => {
    expect(validateFeels({ A: "latin", B: "nope" })).toEqual({ A: "latin" });
    expect(defaultFeel("Bossa Nova")).toBe("latin");
    expect(defaultFeel("Medium Swing")).toBe("swing");
  });
});

describe("chart drawing", () => {
  it("draws hits and a stop, and the drummer view", () => {
    const html = chartHTML(sg, { hits: [{ bar: 1, eighth: 3, kind: "hit" }, { bar: 2, eighth: 0, kind: "stop", until: 3 }], drummer: true });
    expect(html).toContain('class="hm hit"');
    expect(html).toContain("hstop first");
    expect(html).toContain("drummer");
    expect(html).toContain('class="bn">2<');
    expect(chartHTML(sg, {})).not.toContain("hits");
  });
});

describe("band and hits", () => {
  const bar = sg.bars[1];
  const gen = new Generator("swing", 120);
  const base = gen.bar(bar, null, 0, 1);
  it("adds accents on a hit", () => {
    const out = shapeBar(base, 1, bar, [{ bar: 1, eighth: 3, kind: "hit" }], gen, 0);
    expect(out.length).toBeGreaterThan(base.length);
  });
  it("drops out on a stop but keeps the first downbeat", () => {
    const hs: Hit[] = [{ bar: 1, eighth: 0, kind: "stop", until: 2 }];
    expect(shapeBar(base, 1, bar, hs, gen, 0).every(e => e.beat < 0.3)).toBe(true);
    expect(shapeBar(base, 2, bar, hs, gen, 0)).toEqual([]);
  });
});
