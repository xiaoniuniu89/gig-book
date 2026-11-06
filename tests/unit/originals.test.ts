// Original songs (R16): the chart model round-trips through the iReal song string, the bar text reads back, and the AI's answer
// is only accepted when every chord parses and every bar fits.
import { describe, expect, it } from "vitest";
import { decodeSong, unroll } from "@/lib/ireal";
import { barsToText, chartProblems, encodeChart, sectionsFromBars, textToBars, type ChartSection } from "@/lib/irealExport";
import { validateChart } from "@/lib/ai/leadsheet";

const sections: ChartSection[] = [
  { name: "Intro", ts: "4/4", bars: [{ chords: ["D-7", "G7"] }, { chords: ["C^7"] }] },
  { name: "A", ts: "4/4", bars: [
    { chords: ["C^7"], repeatStart: true }, { chords: ["A-7"] }, { chords: ["D-7", "G7"], ending: 1, repeatEnd: true }, { chords: ["C^7", "A7", "D-7"], ending: 2 },
    { chords: ["N.C."], text: "D.S. al Coda" }, { chords: ["Bb7#9"], segno: true },
  ] },
  { name: "B", ts: "3/4", bars: [{ chords: ["F^7"] }, { chords: ["E-7b5", "A7"] }, { chords: ["D-7/G"], coda: true }, { chords: ["C^7"] }] },
];
const raw = encodeChart({ title: "Test Original", composer: "Callaghan Dan", style: "Medium Swing", key: "C", tempo: 120, sections });

describe("encodeChart", () => {
  it("parses back to the same sections, bars, repeats, endings, marks and time signatures", () => {
    const sg = decodeSong(raw);
    expect(sg.title).toBe("Test Original");
    expect(sg.tempo).toBe(120);
    expect(sectionsFromBars(sg.bars)).toEqual(sections);
  });

  it("encodes the same bars again after a round trip", () => {
    const again = encodeChart({ title: "Test Original", composer: "Callaghan Dan", style: "Medium Swing", key: "C", tempo: 120, sections: sectionsFromBars(decodeSong(raw).bars) });
    expect(again).toBe(raw);
  });

  it("keeps repeats and endings playable", () => {
    const sg = decodeSong(raw);
    const seq = unroll(sg.bars);
    // the repeat plays the first ending, then the second
    const a = sg.bars.findIndex(b => b.repeatStart);
    expect(seq.filter(i => i === a)).toHaveLength(2);
  });

  it("writes 6/8 and 12/8 time signatures", () => {
    for (const ts of ["6/8", "12/8", "2/2", "5/4"]) {
      const sg = decodeSong(encodeChart({ title: "T", composer: "", style: "", key: "C", sections: [{ name: "A", ts, bars: [{ chords: ["C"] }, { chords: ["G7"] }] }] }));
      expect(sg.bars).toHaveLength(2);
      expect(sg.bars[0].ts.num + "/" + sg.bars[0].ts.den).toBe(ts);
    }
  });

  it("gives sections other than Intro, Verse and a single letter a spare letter", () => {
    const sg = decodeSong(encodeChart({ title: "T", composer: "", style: "", key: "C", sections: [
      { name: "A", ts: "4/4", bars: [{ chords: ["C"] }] }, { name: "Bridge", ts: "4/4", bars: [{ chords: ["G7"] }] },
    ] }));
    expect(sg.bars.map(b => b.section)).toEqual(["A", "B"]);
  });
});

describe("bar text", () => {
  it("round trips", () => {
    const text = barsToText(sections[1].bars);
    const r = textToBars(text);
    expect(r.errors).toEqual([]);
    expect(r.bars).toEqual(sections[1].bars);
  });

  it("reads friendly chord names and the example from the issue", () => {
    const r = textToBars("| C^7 | A-7 | Dm7 G7 | Cmaj7 |");
    expect(r.errors).toEqual([]);
    expect(r.bars.map(b => b.chords)).toEqual([["C^7"], ["A-7"], ["D-7", "G7"], ["C^7"]]);
  });

  it("lists chords it can't read", () => {
    const r = textToBars("| C^7 | H7 |");
    expect(r.errors).toEqual(["Bar 2: can't read the chord “H7”."]);
  });
});

describe("chartProblems", () => {
  const one = (ts: string, chords: string[], name = "A"): ChartSection[] => [{ name, ts, bars: [{ chords }] }];
  it("accepts a normal chart", () => expect(chartProblems(sections)).toEqual([]));
  it("rejects more chords than the bar has beats", () => {
    expect(chartProblems(one("3/4", ["C", "D", "E", "F"]))).toHaveLength(1);
    expect(chartProblems(one("4/4", ["C", "D", "E", "F"]))).toEqual([]);
    expect(chartProblems(one("6/8", ["C", "D", "E"]))).toHaveLength(1);
  });
  it("rejects names that aren't plain text, and unknown chords", () => {
    expect(chartProblems(one("4/4", ["C"], "<b>A</b>")).length).toBeGreaterThan(0);
    expect(chartProblems(one("4/4", ["Hmaj"]))).toHaveLength(1);
    expect(chartProblems([])).toHaveLength(1);
  });
});

describe("validateChart (the AI's answer)", () => {
  const good = { time: "4/4", key: "Bb", tempo: 140, sections: [
    { name: "A", bars: [{ chords: ["Cmaj7"], repeatStart: true }, { chords: ["Dm7", "G7"], ending: 1, repeatEnd: true }, { chords: ["Cmaj7"], ending: 2 }] },
    { name: "B", time: "3/4", bars: [{ chords: ["F#m7b5", "B7"] }] },
  ] };
  it("turns chord names into iReal symbols and keeps the marks", () => {
    const g = validateChart(good);
    expect(g.errors).toEqual([]);
    expect(g.key).toBe("Bb");
    expect(g.tempo).toBe(140);
    expect(g.sections[0].bars[1]).toEqual({ chords: ["D-7", "G7"], ending: 1, repeatEnd: true });
    expect(g.sections[1].ts).toBe("3/4");
  });
  it("reports instead of fixing: bad chord, too many chords, odd name, nothing found", () => {
    expect(validateChart({ sections: [{ name: "A", bars: [{ chords: ["Zzz"] }] }] }).errors.join(" ")).toContain("Zzz");
    expect(validateChart({ time: "3/4", sections: [{ name: "A", bars: [{ chords: ["C", "D", "E", "F"] }] }] }).errors.join(" ")).toContain("don't fit");
    expect(validateChart({ sections: [{ name: "A <script>", bars: [{ chords: ["C"] }] }] }).errors.length).toBeGreaterThan(0);
    expect(validateChart({ sections: [{ name: "A", bars: [{ chords: ["C"], text: "see <b>this</b>" }] }] }).errors.length).toBeGreaterThan(0);
    expect(validateChart(null).errors.length).toBeGreaterThan(0);
    expect(validateChart("nonsense").errors.length).toBeGreaterThan(0);
  });
  it("ignores a key it doesn't know", () => expect(validateChart({ ...good, key: "H#" }).key).toBe(""));
});
