// Pure code: iReal parsing and export, theory helpers, ABC headers, QR encoding.
import { describe, expect, it } from "vitest";
import { namesTune } from "@/lib/youtube/client";
import { decodeSong, parseChordText, scramble, splitPlaylists, songLink } from "@/lib/ireal";
import { encodeSong, lickLink, lickSongs, parseProgression, progressionMusic, transposeProgression } from "@/lib/irealExport";
import { detectTonic, irealShift, kind, mod12, numeral, pcOf, prefersSharps, prettyQ, spell } from "@/lib/theory";
import { fullAbc } from "@/lib/abc";
import { qrEncode, qrPath } from "@/lib/qr";
import { hrefFor } from "@/lib/contact";
import { canonInstrument, canonInstruments } from "@/lib/instruments";
import { meta, norm, songKey } from "@/lib/songs";
import { tunes } from "../fixtures";

describe("lib/ireal", () => {
  const chart = encodeSong({ title: "Test Tune", key: "C", music: progressionMusic(parseProgression("Dm7 G7 | Cmaj7")), tempo: 120 });

  it("splits a playlist link into its name and songs", () => {
    const link = "<a href=\"irealb://" + encodeURIComponent("A=x=y=Swing=C=n=m===B=x=y=Swing=F=n=m===My Set") + "\">x</a>";
    const [p] = splitPlaylists(link);
    expect(p.name).toBe("My Set");
    expect(p.songs).toHaveLength(2);
    expect(p.songs[1].startsWith("B=")).toBe(true);
  });

  it("names a single-song link after the song, and an unnamed list 'Imported playlist'", () => {
    expect(splitPlaylists("irealb://" + chart)[0].songs).toHaveLength(1);
    expect(splitPlaylists("irealb://" + encodeURIComponent("A=x=y=S=C=n=m===B=x=y=S=C=n=m==="))[0].name).toBe("Imported playlist");
  });

  it("ignores text with no iReal link", () => {
    expect(splitPlaylists("nothing here")).toEqual([]);
  });

  it("round-trips a song through songLink and splitPlaylists", () => {
    const [p] = splitPlaylists(songLink(chart));
    expect(p.songs).toEqual([chart]);
  });

  it("decodes title, key, tempo and chords", () => {
    const s = decodeSong(chart);
    expect(s.title).toBe("Test Tune");
    expect(s.key).toBe("C");
    expect(s.tempo).toBe(120);
    const chords = s.bars.flatMap(b => b.chords).map(c => c.root + c.q);
    expect(chords).toEqual(["D-7", "G7", "C^7"]);
  });

  it("parses chord text and refuses non-chords", () => {
    expect(parseChordText("Bb-7/Eb")).toMatchObject({ root: "Bb", q: "-7", bass: "Eb" });
    expect(parseChordText("C^7")).toMatchObject({ root: "C", q: "^7", bass: "" });
    expect(parseChordText("xyz")).toBeNull();
  });

  it("scramble is the inverse of the decoder's unscramble (a long chart survives)", () => {
    const music = progressionMusic(parseProgression("Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Cmaj7 Ebmaj7 | Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Cmaj7"));
    expect(decodeSong(encodeSong({ title: "Long", key: "C", music })).bars.length).toBe(8);
    expect(scramble(music)).not.toBe(music);
  });

  it("decodes every Jazz Essentials chart without throwing", () => {
    const all = tunes(...Array.from({ length: 147 }, (_, i) => i));
    for (const raw of all) {
      const s = decodeSong(raw);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.bars.length).toBeGreaterThan(0);
    }
  });
});

describe("lib/irealExport", () => {
  it("parseProgression turns lick chord text into iReal symbols", () => {
    expect(parseProgression("Dm7 G7 | Cmaj7")).toEqual([["D-7", "G7"], ["C^7"]]);
    expect(parseProgression("Dm7b5 G7b9 | Cm6")).toEqual([["Dh7", "G7b9"], ["C-6"]]);
    expect(parseProgression("C△7 | Bbmaj7 | F#m7 | Cdim7 | A7/C#")).toEqual([["C^7"], ["Bb^7"], ["F#-7"], ["Co7"], ["A7/C#"]]);
  });

  it("parseProgression says what is wrong", () => {
    expect(() => parseProgression("")).toThrow(/Add some chords/);
    expect(() => parseProgression("Dm7 Xyz")).toThrow(/Can't read the chord/);
    expect(() => parseProgression("C D E F G")).toThrow(/At most 4/);
    expect(() => parseProgression(Array(65).fill("C").join("|"))).toThrow(/64 bars/);
  });

  it("transposes by semitones and spells for the target key", () => {
    const bars = parseProgression("Dm7 G7 | Cmaj7");
    expect(transposeProgression(bars, 0, 0)).toBe(bars);
    expect(transposeProgression(bars, 5, 5)).toEqual([["G-7", "C7"], ["F^7"]]);
    expect(transposeProgression(bars, 2, 2)).toEqual([["E-7", "A7"], ["D^7"]]); // sharps for D
    expect(transposeProgression(bars, 1, 1)).toEqual([["Eb-7", "Ab7"], ["Db^7"]]); // flats for Db
    expect(transposeProgression(parseProgression("A7/C#"), 1, 10)).toEqual([["Bb7/D"]]);
  });

  it("lickSongs gives one song for one key and twelve for all keys, each in its own key", () => {
    const one = lickSongs("ii-V-I", "Dm7 G7 | Cmaj7", "C", false);
    expect(one).toHaveLength(1);
    expect(decodeSong(one[0]).key).toBe("C");
    const all = lickSongs("ii-V-I", "Dm7 G7 | Cmaj7", "C", true);
    expect(all).toHaveLength(12);
    const keys = all.map(s => decodeSong(s).key);
    expect(keys).toEqual(["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]);
    // the tonic chord of each song is its key
    all.forEach(s => {
      const d = decodeSong(s);
      const last = d.bars[d.bars.length - 1].chords[0];
      expect(last.root).toBe(d.key);
    });
  });

  it("lickSongs starts from the lick's own key", () => {
    const f = lickSongs("Bird", "Gm7 C7 | Fmaj7", "F", true);
    expect(decodeSong(f[0]).key).toBe("F");
    expect(decodeSong(f[0]).title).toBe("Bird (F)");
  });

  it("lickLink builds an irealb link; 12 keys make a named playlist", () => {
    expect(lickLink("Bird", "Gm7 C7 | Fmaj7", "F", false)).toMatch(/^irealb:\/\//);
    const [p] = splitPlaylists(lickLink("Bird", "Gm7 C7 | Fmaj7", "F", true));
    expect(p.name).toBe("Bird in 12 keys");
    expect(p.songs).toHaveLength(12);
  });
});

describe("lib/theory", () => {
  it("names pitch classes and spells them", () => {
    expect(pcOf("C")).toBe(0);
    expect(pcOf("Bb")).toBe(10);
    expect(pcOf("F#")).toBe(6);
    expect(spell(1, true)).toBe("C♯");
    expect(spell(1, false)).toBe("D♭");
    expect(spell(-1, false)).toBe("B");
    expect(mod12(-5)).toBe(7);
    expect(prefersSharps(7, false)).toBe(true); // G major
    expect(prefersSharps(5, false)).toBe(false); // F major
  });

  it("classifies chord qualities", () => {
    expect(kind("-7")).toBe("min");
    expect(kind("^7")).toBe("maj");
    expect(kind("")).toBe("maj");
    expect(kind("7")).toBe("dom");
    expect(kind("h7")).toBe("half");
    expect(kind("o7")).toBe("dim");
    expect(kind("sus")).toBe("maj");
    expect(kind("7sus")).toBe("dom");
  });

  it("prints qualities and Roman numerals", () => {
    expect(prettyQ("^7")).toBe("Δ7");
    expect(prettyQ("-7")).toBe("–7");
    expect(prettyQ("7b9")).toBe("7♭9");
    expect(numeral({ root: "D", q: "-7" }, 0)).toBe("ii7");
    expect(numeral({ root: "G", q: "7" }, 0)).toBe("V7");
    expect(numeral({ root: "C", q: "^7" }, 0)).toBe("IΔ");
    expect(numeral({ root: "E", q: "h7" }, 2)).toBe("iiø"); // E over a D tonic
    expect(numeral({ root: "Bb", q: "7" }, 0)).toBe("♭VII7");
  });

  it("finds the tonic of a chart, and the shift iReal applied", () => {
    const s = decodeSong(encodeSong({ title: "T", key: "C", music: progressionMusic(parseProgression("Dm7 G7 | Cmaj7")) }));
    expect(detectTonic(s)).toEqual({ pc: 0, minor: false });
    expect(irealShift({ ...s, target: null })).toBe(0);
    expect(irealShift({ ...s, key: "C", target: 2 })).toBe(2);
    expect(irealShift({ ...s, key: "C", target: 10 })).toBe(-2);
  });
});

describe("lib/abc fullAbc", () => {
  it("adds the headers a bare lick leaves out", () => {
    expect(fullAbc("CDEF|")).toBe("X:1\nM:4/4\nL:1/8\nK:C\nCDEF|");
  });

  it("keeps the headers it is given", () => {
    const out = fullAbc("M:3/4\nL:1/4\nK:Bb\nBcd|");
    expect(out).toBe("X:1\nM:3/4\nL:1/4\nK:Bb\nBcd|");
    expect(fullAbc("K:F\nFGA|")).toBe("X:1\nM:4/4\nL:1/8\nK:F\nFGA|");
  });

  it("trims whitespace around the tune", () => {
    expect(fullAbc("\n  K:G\nGAB|  \n")).toBe("X:1\nM:4/4\nL:1/8\nK:G\nGAB|");
  });
});

describe("lib/qr", () => {
  it("encodes short text as a square matrix with finder patterns", () => {
    const m = qrEncode("https://example.test/pay");
    expect(m).not.toBeNull();
    const size = m!.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect(m!.every(r => r.length === size)).toBe(true);
    // top-left finder: a dark 7x7 ring
    for (let i = 0; i < 7; i++) { expect(m![0][i]).toBe(true); expect(m![6][i]).toBe(true); expect(m![i][0]).toBe(true); expect(m![i][6]).toBe(true); }
    expect(m![1][1]).toBe(false);
    expect(m![3][3]).toBe(true);
  });

  it("is deterministic and grows with the text", () => {
    expect(qrEncode("abc")).toEqual(qrEncode("abc"));
    expect(qrEncode("a".repeat(150))!.length).toBeGreaterThan(qrEncode("abc")!.length);
  });

  it("gives up on text that is too long, and qrPath follows", () => {
    expect(qrEncode("x".repeat(300))).toBeNull();
    expect(qrPath("x".repeat(300))).toBeNull();
    const p = qrPath("hello");
    expect(p?.size).toBeGreaterThanOrEqual(21);
    expect(p?.d).toMatch(/^M/);
  });
});

describe("small helpers", () => {
  it("hrefFor links only safe schemes", () => {
    expect(hrefFor("phone", "+353 (1) 555-0101")).toBe("tel:+3531555-0101".replace("-", ""));
    expect(hrefFor("email", "a@b.test")).toBe("mailto:a@b.test");
    expect(hrefFor("website", "example.test")).toBe("https://example.test");
    expect(hrefFor("website", "javascript:alert(1)")).toBeNull();
    expect(hrefFor("whatsapp", "+353 1 555 0101")).toBe("https://wa.me/35315550101");
  });

  it("canonInstrument fixes case and keeps custom entries", () => {
    expect(canonInstrument("tenor SAX")).toBe("Tenor sax");
    expect(canonInstrument("  Theremin ")).toBe("Theremin");
    expect(canonInstruments(["piano", "Piano", "", "vocals"])).toEqual(["Piano", "Vocals"]);
  });

  it("songKey ignores case, 'The', brackets and key suffixes", () => {
    expect(norm("The Girl From Ipanema (Bossa)")).toBe("girl from ipanema");
    expect(songKey("Autumn Leaves=Kosma Joseph=x=Swing=G-=n=m")).toBe(songKey("autumn leaves=Kosma Joseph=y=Ballad=C-=n=m"));
    expect(meta("Autumn Leaves=Kosma Joseph==Medium Swing=G-").title).toBe("Autumn Leaves");
  });
});

describe("namesTune (automatic YouTube pick)", () => {
  it("needs the tune's name as whole words in the video title", () => {
    expect(namesTune("Bill Evans - Autumn Leaves (Live)", "Autumn Leaves")).toBe(true);
    expect(namesTune("Body & Soul | Coleman Hawkins", "Body And Soul")).toBe(true);
    expect(namesTune("Miles Davis: So What", "So What")).toBe(true);
    expect(namesTune("Girl From Ipanema - Getz/Gilberto", "The Girl From Ipanema")).toBe(true);
    expect(namesTune("What'll I Do - Kathleen Grace", "What Would Larry Do ?")).toBe(false);
    expect(namesTune("How One Hit Wonder Andrew WK Is a Fictional Character", "What Would Larry Do ?")).toBe(false);
    expect(namesTune("Ladybird", "Lady Bird")).toBe(false);
  });
});
