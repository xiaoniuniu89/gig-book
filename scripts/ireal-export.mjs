// Round-trip check for the lick -> iReal Pro export (R8.4): build links with lib/irealExport.ts, parse them back
// with lib/ireal.ts and compare chords. Usage: node scripts/ireal-export.mjs   (Node 22.18+)
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL && ctx.parentURL.endsWith(".ts")) {
      const url = new URL(spec + ".ts", ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { splitPlaylists, decodeSong } = await import("../lib/ireal.ts");
const { lickLink, parseProgression } = await import("../lib/irealExport.ts");

const chordsOf = song => song.bars.map(b => b.chords.map(c => c.root + c.q + (c.bass ? "/" + c.bass : "")));
const fail = [];
const check = (name, fn) => { try { fn(); } catch (e) { fail.push(name + ": " + e.message); } };

// typed forms normalise to iReal symbols
check("normalise", () => assert.deepEqual(
  parseProgression("Dm7 G7 | Cmaj7 | Em7b5 A7b9 | Dm6 | Cm(maj7) | Bdim7 | F#ø7 | C6/9 | G7sus4 | CΔ"),
  [["D-7", "G7"], ["C^7"], ["Eh7", "A7b9"], ["D-6"], ["C-^7"], ["Bo7"], ["F#h7"], ["C69"], ["G7sus"], ["C^7"]]));
check("errors", () => {
  assert.throws(() => parseProgression("Dm7 H7"));
  assert.throws(() => parseProgression("  | "));
  assert.throws(() => parseProgression("C D E F G"));
});

const SRC = "Dm7 G7 | Cmaj7 | A7/C# D7b9 | Gm7 C7 F6 Fmaj7 | Bbmaj7";
const src = parseProgression(SRC);

// one key: one song, same chords and beats
check("single", () => {
  const link = lickLink("ii-V-I", SRC, "C", false);
  assert.match(link, /^irealb:\/\//);
  const [pl] = splitPlaylists(link);
  assert.equal(pl.songs.length, 1);
  const s = decodeSong(pl.songs[0]);
  assert.equal(s.title, "ii-V-I (C)");
  assert.equal(s.key, "C");
  assert.deepEqual(chordsOf(s), src);
  assert.deepEqual(s.bars.map(b => b.chords.map(c => c.beat)), [[0, 2], [0], [0, 2], [0, 1, 2, 3], [0]]);
});

// 12 keys: a playlist of 12 songs, song k is the source moved up k semitones (qualities unchanged)
const PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const split = c => /^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/.exec(c).slice(1);
check("all 12", () => {
  const [pl] = splitPlaylists(lickLink("ii-V-I", SRC, "C", true));
  assert.equal(pl.name, "ii-V-I in 12 keys");
  assert.equal(pl.songs.length, 12);
  pl.songs.forEach((raw, k) => {
    const s = decodeSong(raw);
    assert.equal(PC[s.key], k, "key " + s.key);
    const got = chordsOf(s);
    assert.equal(got.length, src.length);
    got.forEach((bar, i) => bar.forEach((c, j) => {
      const [r0, q0, b0] = split(src[i][j]), [r1, q1, b1] = split(c);
      assert.equal(PC[r1], (PC[r0] + k) % 12, `bar ${i + 1} in ${s.key}: ${c}`);
      assert.equal(q1, q0);
      if (b0) assert.equal(PC[b1], (PC[b0] + k) % 12);
    }));
  });
});

// a lick written in F: the first song stays in F, the next is a semitone up
check("lick key", () => {
  const [pl] = splitPlaylists(lickLink("x", "Gm7 C7 | Fmaj7", "F", true));
  assert.deepEqual(chordsOf(decodeSong(pl.songs[0])), [["G-7", "C7"], ["F^7"]]);
  assert.deepEqual(chordsOf(decodeSong(pl.songs[1])), [["Ab-7", "Db7"], ["Gb^7"]]);
});

if (fail.length) { console.error(fail.join("\n")); process.exit(1); }
console.log("ireal export: ok");
