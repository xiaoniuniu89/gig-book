// Parity check: run the legacy modules (js/ireal.js, js/theory.js, js/chart.js) and the TypeScript port
// (lib/) over an iReal Pro export and confirm identical songs, bars, unroll() order, keys and chart HTML.
// Usage: node scripts/parity.mjs path/to/playlist.html
// Needs Node 22.18+ (runs the .ts files directly via type stripping).
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// lib/ uses extensionless imports (bundler style); resolve them to .ts here.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL && ctx.parentURL.endsWith(".ts")) {
      const url = new URL(spec + ".ts", ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const oldP = await import("../js/ireal.js");
const oldT = await import("../js/theory.js");
const oldC = await import("../js/chart.js");
const newP = await import("../lib/ireal.ts");
const newT = await import("../lib/theory.ts");
const newC = await import("../lib/chart.ts");

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/parity.mjs <file.html>"); process.exit(2); }
const text = readFileSync(file, "utf8");
const a = oldP.splitPlaylists(text), b = newP.splitPlaylists(text);
if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("splitPlaylists differs"); process.exit(1); }
const j = JSON.stringify;
let songs = 0, bars = 0, unrolled = 0, charts = 0, diffs = 0;
for (const pl of a) for (const raw of pl.songs) {
  songs++;
  const s1 = oldP.decodeSong(raw), s2 = newP.decodeSong(raw);
  const why = [];
  if (j(s1) !== j(s2)) why.push("song/bars");
  for (const last of [true, false]) if (j(oldP.unroll(s1.bars, last)) !== j(newP.unroll(s2.bars, last))) why.push("unroll");
  const sh = newT.irealShift(s2);
  if (oldT.irealShift(s1) !== sh || oldT.keyLabel(s1, sh) !== newT.keyLabel(s2, sh)) why.push("key");
  for (const mode of ["trad", "bh"]) {
    const o = { shift: sh, mode, sc: true, tn: true, fn: true };
    if (oldC.chartHTML(s1, o) !== newC.chartHTML(s2, o)) why.push("chart " + mode);
    charts++;
  }
  bars += s2.bars.length; unrolled += newP.unroll(s2.bars, true).length;
  if (why.length) { diffs++; if (diffs <= 5) console.error("DIFF:", s1.title, why.join(", ")); }
}
console.log(`playlists=${a.length} songs=${songs} bars=${bars} unrolledBars=${unrolled} chartsCompared=${charts} differences=${diffs}`);
process.exit(diffs ? 1 : 0);
