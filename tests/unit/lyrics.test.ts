// Lyrics: version names, section blocks and the form taken from the chart.
import { describe, expect, it } from "vitest";
import { encodeSong, parseProgression, progressionMusic } from "@/lib/irealExport";
import { song } from "@/lib/songs";
import { BUILTIN_LIBRARY } from "@/lib/seeds";
import { blocks, formOf, formTemplate, joinName, splitName } from "@/lib/lyrics";

describe("lib/lyrics", () => {
  it("names a version with a # first line, and leaves plain text as Lyrics", () => {
    expect(splitName("# My version\nla la")).toEqual({ name: "My version", text: "la la" });
    expect(splitName("la la\n# not a name")).toEqual({ name: "Lyrics", text: "la la\n# not a name" });
    expect(joinName("Lyrics", "la")).toBe("la");
    expect(joinName("  Live   take ", "la")).toBe("# Live take\nla");
    expect(splitName(joinName("Live take", "la"))).toEqual({ name: "Live take", text: "la" });
  });

  it("splits words into labelled sections", () => {
    expect(blocks("first line\n\n[A]\none\ntwo\n\n[Chorus]\n\nthree\n[B]\n")).toEqual([
      { label: null, lines: "first line" },
      { label: "A", lines: "one\ntwo" },
      { label: "Chorus", lines: "three" },
      { label: "B", lines: "" },
    ]);
    expect(blocks("no sections\nat all")).toEqual([{ label: null, lines: "no sections\nat all" }]);
    expect(blocks("a [B] in a line stays text")).toEqual([{ label: null, lines: "a [B] in a line stays text" }]);
  });

  it("takes the form through repeats", () => {
    const paris = song(BUILTIN_LIBRARY.songs.find(s => s.startsWith("Afternoon In Paris"))!);
    expect(formOf(paris.bars)).toEqual(["A", "A", "B", "A"]);
    expect(formTemplate(["A", "B"])).toBe("[A]\n\n[B]\n");
    const plain = song(encodeSong({ title: "Plain", key: "C", music: progressionMusic(parseProgression("C | F | G | C")), tempo: 120 }));
    expect(formOf(plain.bars)).toEqual(["A"]);
    expect(formOf(plain.bars.map(b => ({ ...b, section: null })))).toEqual([]);
  });
});
