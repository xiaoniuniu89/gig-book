// Chart versions (R3.5): the changes text, and the check applied to whatever the AI says.
import { describe, expect, it } from "vitest";
import { encodeSong, parseProgression, progressionMusic } from "@/lib/irealExport";
import { song } from "@/lib/songs";
import { applyChanges, changesText, cleanName, normaliseChanges, parseChanges, validateVersions } from "@/lib/versions";

const sg = song(encodeSong({ title: "Test Tune", key: "C", music: progressionMusic(parseProgression("Dm7 | G7 | Cmaj7 | Cmaj7")), tempo: 120 }));

describe("lib/versions", () => {
  it("writes the original out and reads it back unchanged", () => {
    const t = changesText(sg);
    expect(t).toBe("| Dm7 | G7 | Cmaj7 | Cmaj7 |");
    expect(normaliseChanges(t, sg)).toBe(t);
  });

  it("reads friendly chord names and applies them to the same form", () => {
    const v = applyChanges(sg, "| Dm7 G7#9 | Db7 | Cmaj7 | C6/E |")!;
    expect(v.bars).toHaveLength(4);
    expect(v.bars[0].chords.map(c => c.q)).toEqual(["-7", "7#9"]);
    expect(v.bars[0].chords[1].beat).toBe(2);
    expect(v.bars[3].chords[0]).toMatchObject({ root: "C", q: "6", bass: "E" });
    expect(applyChanges(sg, "| Dm7 | G7 | Cmaj7 | Cmaj7 |")!.bars[3].chords[0].cont).toBe(true);
  });

  it("refuses text that isn't chords or doesn't fit the bar count", () => {
    expect("error" in parseChanges("| Dm7 | G7 | Cmaj7 |", 4)).toBe(true);
    expect("error" in parseChanges("| Dm7 | G7 | Cmaj7 | Hello |", 4)).toBe(true);
    expect("error" in parseChanges("| Dm7 | G7 | Cmaj7 | C8 |", 4)).toBe(true);
    expect("error" in parseChanges("", 4)).toBe(true);
    expect(applyChanges(sg, "| Dm7 | G7 |")).toBeNull();
  });

  it("keeps at most 3 AI versions, drops bad, duplicate and unchanged ones, and cleans names", () => {
    const good = (n: string, c: string) => ({ name: n, changes: c });
    const out = validateVersions({ versions: [
      good("Bill Evans · Portrait in Jazz, 1959", "| Dm7 | Db7 | Cmaj7 | A7alt |"),
      good("Wrong bars", "| Dm7 | G7 |"),
      good("Not chords", "| Dm7 | G7 | Cmaj7 | rm -rf |"),
      good("Same as original", "| Dm7 | G7 | Cmaj7 | Cmaj7 |"),
      good("<b>Dup</b> http://x.y", "| Dm7 | Db7 | Cmaj7 | A7alt |"),
      good("Second", "| Em7 | A7 | Dm7 | G7 |"),
      good("Third", "| Fmaj7 | Bb7 | Em7 | A7 |"),
      good("Fourth", "| Gmaj7 | C7 | Fm7 | Bb7 |"),
      { name: 5, changes: null }, "x", null,
    ] }, sg);
    expect(out.map(v => v.name)).toEqual(["Bill Evans · Portrait in Jazz, 1959", "Second", "Third"]);
    expect(validateVersions("nope", sg)).toEqual([]);
    expect(validateVersions({ versions: "x" }, sg)).toEqual([]);
  });

  it("makes names plain text of at most 60 characters", () => {
    expect(cleanName("  <script>Bill *Evans*  [x]  https://evil.example ")).toBe("script Bill Evans x");
    expect(cleanName("x".repeat(100))).toHaveLength(60);
    expect(cleanName(undefined)).toBe("");
  });
});
