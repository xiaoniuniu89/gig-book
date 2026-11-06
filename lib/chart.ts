// Chord chart rendering with the scale band, guide tones, Barry Harris families and harmony brackets.
// Framework-free: returns an HTML string (every piece of text is escaped). Typed port of js/chart.js.
import type { Chord, Song } from "./ireal";
import { stopAt, barHits, defaultFeel, FEELS, validateHits, type Hit, type Feels } from "./hits";
import { analyse, functionGroups, tradType, PARENT, bhLabel, guideTones, chordPcs, kind, pcOf, prettyQ, spell, prefersSharps, mod12 } from "./theory";

export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

function chordHTML(c: Chord, shift: number, sharps: boolean): string {
  if (c.nc || !c.root) return `<span class="ch">N.C.</span>`;
  const r = spell(pcOf(c.root) + shift, sharps);
  const q = prettyQ(c.q);
  const b = c.bass ? `<span class="b">/${spell(pcOf(c.bass) + shift, sharps)}</span>` : "";
  return `<span class="ch">${r}${q ? `<sup>${esc(q)}</sup>` : ""}${b}</span>`;
}

export interface ChartOpts {
  shift?: number;
  mode?: "trad" | "bh";
  sc?: boolean;
  tn?: boolean;
  fn?: boolean;
  extraClass?: string;
  /** R3.6: this setlist tune's hits, stops and fermatas, drawn above the bars. */
  hits?: Hit[];
  /** Rhythm view: form, bar numbers, feel per section, and a rhythm staff per bar (time slashes, hits as notes); chords small. */
  drummer?: boolean;
  feels?: Feels;
  /** Hit editor: the bar picked for editing, and whether bars can be tapped. */
  sel?: number | null;
  editHits?: boolean;
}

const HIT_TITLE = { hit: "Hit", push: "Push", fermata: "Fermata", stop: "Stop" } as const;
const slotLeft = (e: number) => 6.25 + e * 12.5; // % across the bar

// A stemmed note for the rhythm staff; `flag` makes it a lone eighth.
const NOTE = (flag: boolean) => `<svg class="rn-svg" viewBox="0 0 12 24" aria-hidden="true"><ellipse cx="4.2" cy="20.2" rx="3.7" ry="2.7" transform="rotate(-22 4.2 20.2)"/><rect x="7" y="1.5" width="1.3" height="19"/>${flag ? `<path d="M8.3 1.5c.4 3.4 3.6 4.6 3.2 9.2-.6-2.6-1.8-3.9-3.2-4.2z"/>` : ""}</svg>`;

/** One bar of drum-chart rhythm: time slashes on the line, the band's hits as accented notes above it (as on a big band drum part). */
export function rhythmHTML(hits: Hit[], bi: number, beats = 4): string {
  const st = stopAt(hits, bi);
  const at = new Map(barHits(hits, bi).filter(h => h.kind === "hit" || h.kind === "push").map(h => [h.eighth, h]));
  const parts: string[] = [];
  if (!st) for (let k = 0; k < Math.min(4, beats); k++) parts.push(`<span class="sl" style="left:${slotLeft(2 * k)}%"></span>`);
  const note = (h: Hit, flag: boolean) =>
    `<span class="rn" style="left:${slotLeft(h.eighth)}%" title="${HIT_TITLE[h.kind]}"><span class="ac">&gt;</span>${NOTE(flag)}${h.kind === "push" ? `<span class="tie"></span>` : ""}</span>`;
  for (let k = 0; k < 4; k++) {
    const a = at.get(2 * k), b = at.get(2 * k + 1);
    if (a) parts.push(note(a, false));
    if (b) parts.push(note(b, !a));
    if (a && b) parts.push(`<span class="beam" style="left:calc(${slotLeft(2 * k)}% + 4px);width:12.5%"></span>`);
  }
  return `<div class="rhy${st ? " stopped" : ""}">${parts.join("")}</div>`;
}

interface Group { label: string; single: string; keys: string[] }
interface Info { group: Group; tones: { n: string; keep: boolean }[]; fam: string }

export function chartHTML(song: Song, opts: ChartOpts): string {
  const { shift = 0, mode = "trad" } = opts;
  const a = analyse(song);
  const tpc = mod12(a.tonicPc + shift);
  const sharps = prefersSharps(tpc, a.minor);
  const name = (pc: number) => spell(pc + shift, sharps);
  const fn = functionGroups(a, pc => name(pc));
  const info: Record<string, Info> = {};
  let prevKey: string | null = null;
  const groups: Group[] = [];
  a.flat.forEach(({ c, key }) => {
    const nxt = a.next[key];
    const deg = mod12(pcOf(c.root) - a.tonicPc);
    const isII = a.marks[key] === "ii";
    const nm = (off: number) => name(pcOf(c.root) + off);
    let gkey: string, label: string, single: string;
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
    const nextSet = nxt ? chordPcs(nxt) : new Set<number>();
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

  const rows: { mark: string; bars: { b: Song["bars"][number]; bi: number }[] }[] = [];
  let row: (typeof rows)[number] | null = null;
  song.bars.forEach((b, bi) => {
    const breakHere = !row || row.bars.length === 4 || b.section || (b.ending && b.ending > 1) || (b.coda && bi > 0 && song.bars[bi - 1].final);
    if (breakHere || !row) { row = { mark: b.section || "", bars: [] }; rows.push(row); }
    row.bars.push({ b, bi });
  });
  const lastIdx = song.bars.length - 1;
  const hits = validateHits(opts.hits || [], song.bars.length);
  const dFeel = defaultFeel(song.style);
  const feelTag = (sec: string) => `<span class="feel" data-feel="${esc(sec)}">${FEELS[opts.feels?.[sec] || dFeel]}</span>`;
  const hitHTML = (bi: number) => {
    const st = stopAt(hits, bi);
    const parts: string[] = [];
    if (st) parts.push(`<span class="hstop${st.bar === bi ? " first" : ""}">${st.bar === bi ? "Stop" : ""}</span>`);
    for (const h of barHits(hits, bi)) {
      parts.push(`<span class="hm ${h.kind}" style="left:${slotLeft(h.eighth)}%" title="${HIT_TITLE[h.kind]}">${h.kind === "fermata" ? "𝄐" : "&gt;"}</span>`);
    }
    return parts.length ? `<div class="hits">${parts.join("")}</div>` : "";
  };
  const html = rows.map(r => {
    const cells = r.bars.map(({ b, bi }, i) => {
      const cls = ["mbar"];
      if (b.repeatStart) cls.push("rs");
      if (b.repeatEnd) cls.push("re");
      if (b.final || bi === lastIdx) cls.push("end");
      else if (i === r.bars.length - 1 && !b.repeatEnd) cls.push("last-in-row");
      const n = b.chords.length;
      if (n >= 2) cls.push("n" + Math.min(n, 4));
      let inner: string;
      // % repeats the whole bar before; an empty bar after a two-chord bar only holds the last chord, so it names it
      if (b.sim || (n === 1 && b.chords[0].cont && song.bars[bi - 1]?.chords.length === 1)) inner = `<div class="cell"><div class="brk scb"></div><span class="ch sim">%</span></div>`;
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
      if (opts.sel === bi) cls.push("hsel");
      const bn = opts.drummer ? `<span class="bn">${bi + 1}</span>` : "";
      return `<div class="${cls.join(" ")}" data-bar="${bi}">${bn}${hitHTML(bi)}${marks}<div class="cells">${inner}</div>${opts.drummer ? rhythmHTML(hits, bi, b.beats) : ""}</div>`;
    }).join("");
    const sec = r.mark || (r.bars[0].bi === 0 ? "" : null);
    return `<div class="row"><div class="mark">${r.mark ? `<span>${esc(r.mark)}</span>` : ""}${opts.drummer && sec !== null ? feelTag(sec) : ""}</div>${cells}</div>`;
  }).join("");
  const flags = [opts.extraClass || "", opts.fn === false ? "no-rn" : "", opts.sc === false ? "no-sc" : "", opts.tn === false ? "no-tn" : "", opts.drummer ? "drummer" : "", opts.editHits ? "hedit" : ""].join(" ");
  return `<div class="chart ${flags}" aria-label="Chord chart">${html}</div>`;
}
