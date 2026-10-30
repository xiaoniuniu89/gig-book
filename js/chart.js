// Chord chart rendering with the scale band, guide tones, Barry Harris families and harmony brackets.
import { analyse, functionGroups, tradType, PARENT, bhLabel, guideTones, chordPcs, kind, pcOf, prettyQ, spell, useSharps, mod12 } from "./theory.js";

export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function chordHTML(c, shift, sharps) {
  if (c.nc) return `<span class="ch">N.C.</span>`;
  const r = spell(pcOf(c.root) + shift, sharps);
  const q = prettyQ(c.q);
  const b = c.bass ? `<span class="b">/${spell(pcOf(c.bass) + shift, sharps)}</span>` : "";
  return `<span class="ch">${r}${q ? `<sup>${esc(q)}</sup>` : ""}${b}</span>`;
}

// opts: { shift, mode: "trad"|"bh", sc, tn, fn, extraClass }
export function chartHTML(song, opts) {
  const { shift = 0, mode = "trad" } = opts;
  const a = analyse(song);
  const tpc = mod12(a.tonicPc + shift);
  const sharps = useSharps(tpc, a.minor);
  const name = pc => spell(pc + shift, sharps);
  const fn = functionGroups(a, pc => name(pc));
  const info = {};
  let prevKey = null;
  const groups = [];
  a.flat.forEach(({ c, key }) => {
    const nxt = a.next[key];
    const deg = mod12(pcOf(c.root) - a.tonicPc);
    const isII = a.marks[key] === "ii";
    const nm = off => name(pcOf(c.root) + off);
    let gkey, label, single;
    if (mode === "trad") {
      const type = tradType(c, nxt, deg, isII, a.minor, a.marks[key] === "v");
      const [off, fam] = PARENT[type];
      const ppc = mod12(pcOf(c.root) + off);
      gkey = fam + ":" + (fam === "dim" ? ppc % 3 : ppc);
      label = fam === "major" ? name(ppc) + " major" : fam === "mel" ? name(ppc) + " mel. minor" : fam === "harm" ? name(ppc) + " harm. minor" : "diminished";
      single = nm(0) + " " + type;
    } else {
      label = bhLabel(c, nxt, deg, isII, a.minor, nm);
      gkey = label; single = label;
    }
    if (gkey !== prevKey) groups.push({ label, single, keys: [] });
    groups[groups.length - 1].keys.push(key);
    prevKey = gkey;
    const nextSet = nxt ? chordPcs(nxt) : new Set();
    const tones = guideTones(c).map(x => { const p = mod12(pcOf(c.root) + x); return { n: name(p), keep: nextSet.has(p) }; });
    let fam = "";
    if (mode === "bh") {
      const k = kind(c.q);
      if (k === "dom") fam = [3, 6, 9].map(o => nm(o) + "7").join(" ");
      else if (k === "dim") fam = [-1, 2, 5, 8].map(o => nm(o) + "7").join(" ");
      else if ((k === "min" || k === "half") && isII && nxt) { const v = pcOf(nxt.root) - pcOf(c.root); fam = [3, 6, 9].map(o => nm(v + o) + "7").join(" "); }
    }
    info[key] = { group: groups[groups.length - 1], tones, fam };
  });

  const rows = [];
  let row = null;
  song.bars.forEach((b, bi) => {
    const breakHere = !row || row.bars.length === 4 || b.section || (b.ending && b.ending > 1) || (b.coda && bi > 0 && song.bars[bi - 1].final);
    if (breakHere) { row = { mark: b.section || "", bars: [] }; rows.push(row); }
    row.bars.push({ b, bi });
  });
  const lastIdx = song.bars.length - 1;
  const html = rows.map(r => {
    const cells = r.bars.map(({ b, bi }, i) => {
      const cls = ["mbar"];
      if (b.repeatStart) cls.push("rs");
      if (b.repeatEnd) cls.push("re");
      if (b.final || bi === lastIdx) cls.push("end");
      else if (i === r.bars.length - 1 && !b.repeatEnd) cls.push("last-in-row");
      const n = b.chords.length;
      if (n >= 3) cls.push("n" + Math.min(n, 4));
      let inner;
      if (b.sim) inner = `<div class="cell"><div class="brk scb"></div><span class="ch sim">%</span></div>`;
      else if (n === 1 && b.chords[0].cont) inner = `<div class="cell"><div class="brk scb"></div><span class="ch sim">·</span></div>`;
      else inner = b.chords.map((c, ci) => {
        const key = bi + ":" + ci;
        const f = info[key], g = fn[key];
        const pos = ci === 0 ? " first" : "";
        const last = ci === b.chords.length - 1 ? " last" : "";
        let scB = `<div class="brk scb${pos}${last}"></div>`;
        if (f) {
          const grp = f.group, multi = grp.keys.length > 1;
          const s = grp.keys[0] === key, e = grp.keys[grp.keys.length - 1] === key;
          scB = `<div class="brk scb${pos}${last}${multi ? " line" : ""}${s ? " s" : ""}${e ? " e" : ""}">${s ? esc(multi ? grp.label : grp.single) : ""}</div>`;
        }
        let fnB = `<div class="brk fnb${pos}${last}"></div>`;
        if (g) fnB = `<div class="brk fnb${pos}${last}${g.multi ? " line" : ""}${g.start ? " s" : ""}${g.end ? " e" : ""}">${g.start ? esc(g.label) : ""}</div>`;
        const tones = f ? f.tones.map(t => `<span class="${t.keep ? "keep" : ""}">${t.n}</span>`).join(" ") : "";
        return `<div class="cell">${scB}${chordHTML(c, shift, sharps)}<span class="tn">${tones}</span>${f && f.fam ? `<span class="fam">${f.fam}</span>` : ""}${fnB}</div>`;
      }).join("");
      const marks = [
        b.ending ? `<span class="ending">${b.ending}.</span>` : "",
        b.segno ? `<span class="sign" title="Segno">𝄋</span>` : "",
        b.coda ? `<span class="sign" title="Coda">𝄌</span>` : "",
        b.comment ? `<span class="cmt">${esc(b.comment)}</span>` : ""
      ].join("");
      return `<div class="${cls.join(" ")}" data-bar="${bi}">${marks}<div class="cells">${inner}</div></div>`;
    }).join("");
    return `<div class="row"><div class="mark">${r.mark ? `<span>${esc(r.mark)}</span>` : ""}</div>${cells}</div>`;
  }).join("");
  const flags = [opts.extraClass || "", opts.fn === false ? "no-rn" : "", opts.sc === false ? "no-sc" : "", opts.tn === false ? "no-tn" : ""].join(" ");
  return `<div class="chart ${flags}" aria-label="Chord chart">${html}</div>`;
}
