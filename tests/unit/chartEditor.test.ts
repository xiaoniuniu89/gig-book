// Original songs (R16.5): chords shown in normal notation, and the bar grid's fromEdit.
import { describe, expect, it } from "vitest";
import { displayChord, irealChord, readChords } from "@/lib/irealExport";
import { blankSection, fromEdit, toEdit, type EditSection } from "@/lib/chartEdit";

describe("displayChord", () => {
  const pairs: [string, string][] = [
    ["C^7", "Cmaj7"], ["D-7", "Dm7"], ["G7", "G7"], ["F#h7", "F#m7b5"], ["Bbh7", "Bbm7b5"], ["Co7", "Cdim7"], ["Co", "Cdim"],
    ["C6", "C6"], ["C69", "C69"], ["G7sus", "G7sus4"], ["Csus", "Csus4"], ["G7alt", "G7alt"], ["C-^7", "CmMaj7"], ["C+", "Caug"], ["C-", "Cm"],
    ["C/E", "C/E"], ["D-7/G", "Dm7/G"], ["Bb7#9", "Bb7#9"], ["Eb^9", "Ebmaj9"],
  ];
  it.each(pairs)("shows %s as %s", (sym, shown) => expect(displayChord(sym)).toBe(shown));
  it.each(pairs)("reads %s back to %s's iReal symbol", (sym, shown) => {
    expect(irealChord(shown)).toBe(sym);
    expect(irealChord(displayChord(sym))).toBe(sym);
  });
  it("leaves N.C. and unknown text alone", () => {
    expect(displayChord("N.C.")).toBe("N.C.");
    expect(displayChord("Hx7")).toBe("Hx7");
  });
});

describe("readChords", () => {
  it("reads chords split by spaces or commas, skips %, keeps N.C.", () => {
    expect(readChords("Dm7, G7  N.C. %")).toEqual({ chords: ["D-7", "G7", "N.C."], bad: [] });
  });
  it("lists what it can't read", () => expect(readChords("Cmaj7 Hx7")).toEqual({ chords: ["C^7"], bad: ["Hx7"] }));
});

const sec = (over: Partial<EditSection> = {}): EditSection => ({ ...blankSection("A", "4/4"), ...over });

describe("fromEdit", () => {
  it("reads the typed chords with marks, endings and words, and leaves empty bars empty", () => {
    const e = sec({
      bars: [{ chords: [], repeatStart: true, segno: true }, { chords: [] }, { chords: [], ending: 1, repeatEnd: true, text: "D.S. al Coda" }, { chords: [], ending: 2, coda: true }],
      typed: ["Cmaj7", "", "Dm7 G7", "C/E"],
    });
    const r = fromEdit([e]);
    expect(r.errors).toEqual([]);
    expect(r.sections[0].bars).toEqual([
      { chords: ["C^7"], repeatStart: true, segno: true }, { chords: [] },
      { chords: ["D-7", "G7"], ending: 1, repeatEnd: true, text: "D.S. al Coda" }, { chords: ["C/E"], ending: 2, coda: true },
    ]);
  });
  it("drops marks that are switched off and empty words", () => {
    const r = fromEdit([sec({ bars: [{ chords: [], repeatStart: false, ending: undefined, text: " " }, { chords: [] }, { chords: [] }, { chords: [] }], typed: ["C", "", "", ""] })]);
    expect(r.sections[0].bars[0]).toEqual({ chords: ["C"] });
  });
  it("reports a chord it can't read with the bar number, and doesn't drop it silently", () => {
    const r = fromEdit([sec({ typed: ["Cmaj7", "Hx7", "", ""] })]);
    expect(r.errors).toEqual(["Section “A”, bar 2: can't read the chord “Hx7”."]);
  });
  it("reports a bar that doesn't fit the time signature", () => {
    const r = fromEdit([sec({ ts: "3/4", typed: ["C D E F", "", "", ""] })]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("don't fit 3/4");
  });
  it("reports a section with no bars", () => expect(fromEdit([sec({ bars: [], typed: [] })]).errors.join(" ")).toContain("no bars"));
  it("round trips through toEdit", () => {
    const sections = [{ name: "A", ts: "4/4", bars: [{ chords: ["D-7", "G7"], repeatEnd: true }, { chords: ["C^7"], ending: 2 }, { chords: ["N.C."] }] }];
    const e = toEdit(sections);
    expect(e[0].typed).toEqual(["Dm7 G7", "Cmaj7", "N.C."]);
    expect(fromEdit(e)).toEqual({ sections, errors: [] });
  });
});
