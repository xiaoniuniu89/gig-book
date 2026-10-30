// Music theory helpers: spelling, keys, harmonic function, chord scales, guide tones.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const FLATS = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export const SHARPS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const NUMERALS = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];

export function pcOf(name) {
  let p = PC[name[0]];
  if (name[1] === "b") p -= 1;
  if (name[1] === "#") p += 1;
  return (p + 12) % 12;
}
export const mod12 = n => ((n % 12) + 12) % 12;
export function useSharps(tonicPc, minor) {
  return (minor ? [4, 11, 6, 1, 9] : [7, 2, 9, 4, 11]).includes(mod12(tonicPc));
}
export function spell(pc, sharps) { return (sharps ? SHARPS : FLATS)[mod12(pc)]; }

export function kind(q) {
  if (q.startsWith("h")) return "half";
  if (q.startsWith("o")) return "dim";
  if (q.startsWith("-")) return "min";
  if (q.startsWith("^") || q === "" || q.startsWith("6") || q.startsWith("add") || q === "2" || q === "5" || q === "+") return "maj";
  if (q.includes("sus") && !/7|9|11|13/.test(q)) return "maj";
  return "dom";
}
export function prettyQ(q) {
  if (q === "h") return "ø7";
  if (q === "o") return "°";
  if (q === "^") return "Δ7";
  return q.replace(/^-/, "–").replace(/\^/g, "Δ").replace(/^h/, "ø").replace(/^o/, "°")
    .replace(/b(?=\d)/g, "♭").replace(/#/g, "♯");
}
export function numeral(c, tonicPc) {
  const deg = mod12(pcOf(c.root) - tonicPc);
  const k = kind(c.q);
  let n = NUMERALS[deg];
  if (k === "min" || k === "half" || k === "dim") n = n.replace(/[IV]+/, m => m.toLowerCase());
  let s = "";
  if (k === "dom") s = c.q.includes("sus") ? "7sus" : "7";
  else if (k === "maj") s = c.q.startsWith("^") ? "Δ" : c.q.startsWith("6") ? "6" : "";
  else if (k === "min") s = c.q.startsWith("-^") ? "Δ7" : c.q.startsWith("-6") ? "6" : /^-(7|9|11|13)/.test(c.q) ? "7" : "";
  else if (k === "half") s = "ø";
  else if (k === "dim") s = "°7";
  return n + s;
}

const isTonicType = c => c.root && ["maj", "min"].includes(kind(c.q)) && !c.q.includes("sus");

// The key the chords are actually in. iReal's key field is usually right, but some charts are mislabelled
// (e.g. a tune labelled F whose chords are in B♭), so check it against the tonic-type chords.
export function detectTonic(song) {
  const label = song.key || "C";
  const labelPc = pcOf(label.replace("-", ""));
  const labelMinor = label.includes("-");
  const flat = song.bars.flatMap(b => b.chords).filter(c => c.root);
  // the last chord that is a resting point: tonic-type and not the ii of a following ii–V
  let endChord = null;
  const tail = flat.slice(-8);
  for (let i = tail.length - 1; i >= 0; i--) {
    const c = tail[i], n = tail[i + 1];
    if (!isTonicType(c)) continue;
    if (n && kind(n.q) === "dom" && mod12(pcOf(n.root) - pcOf(c.root)) === 5 && kind(c.q) === "min") continue;
    endChord = c; break;
  }
  if (!endChord || pcOf(endChord.root) === labelPc) return { pc: labelPc, minor: labelMinor };
  const count = pc => flat.filter(c => isTonicType(c) && pcOf(c.root) === pc).length;
  const endPc = pcOf(endChord.root);
  // only overrule iReal's label when the chords clearly sit somewhere else and never rest on the labelled key
  if (count(labelPc) === 0 && count(endPc) >= 2) return { pc: endPc, minor: kind(endChord.q) === "min" };
  return { pc: labelPc, minor: labelMinor };
}

// Semitone shift iReal applies to show the chart in the singer's key (song.target: 0 = C … 11 = B).
export function irealShift(song) {
  if (song.target === null || song.target === undefined) return 0;
  const label = pcOf((song.key || "C").replace("-", ""));
  const minor = (song.key || "").includes("-");
  const target = minor ? mod12(song.target + 9) : song.target;
  return mod12(target - label + 6) - 6;
}

export function analyse(song) {
  const t = detectTonic(song);
  const flat = [];
  song.bars.forEach((b, bi) => b.chords.forEach((c, ci) => { if (c.root) flat.push({ c, bi, ci, key: bi + ":" + ci }); }));
  const marks = {}, next = {};
  flat.forEach((f, i) => { next[f.key] = flat[i + 1] ? flat[i + 1].c : null; });
  for (let i = 0; i < flat.length - 1; i++) {
    const a = flat[i].c, b = flat[i + 1].c;
    if (["min", "half"].includes(kind(a.q)) && kind(b.q) === "dom" && mod12(pcOf(b.root) - pcOf(a.root)) === 5) {
      marks[flat[i].key] = "ii";
      marks[flat[i + 1].key] = "v";
    }
  }
  return { tonicPc: t.pc, minor: t.minor, flat, marks, next };
}

// Harmonic function in the words players use: ii–V–I of X, backdoor, line cliché ...
export function functionGroups(a, nameOf) {
  const flat = a.flat;
  const deg = c => mod12(pcOf(c.root) - a.tonicPc);
  const up4 = (x, y) => mod12(pcOf(y.root) - pcOf(x.root)) === 5;
  const downHalf = (x, y) => mod12(pcOf(x.root) - pcOf(y.root)) === 1;
  const same = (x, y) => x.root === y.root && x.q === y.q;
  const isMin = c => ["min", "half"].includes(kind(c.q));
  const isDom = c => kind(c.q) === "dom";
  const of = (pc, minor) => {
    const d = mod12(pc - a.tonicPc);
    if (d === 0 && minor === a.minor) return "";
    let n = NUMERALS[d];
    if (minor) n = n.replace(/[IV]+/, m => m.toLowerCase());
    const diatonic = a.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9];
    return " of " + n + (diatonic.includes(d) ? "" : " (" + nameOf(pc) + ")");
  };
  const chainLen = i => {
    let L = 1;
    while (flat[i + L] && isDom(flat[i + L].c) && (up4(flat[i + L - 1].c, flat[i + L].c) || downHalf(flat[i + L - 1].c, flat[i + L].c) || flat[i + L].c.root === flat[i + L - 1].c.root)) L++;
    return L;
  };
  const out = [];
  let i = 0;
  while (i < flat.length) {
    const c = flat[i].c, n1 = flat[i + 1] && flat[i + 1].c, n2 = flat[i + 2] && flat[i + 2].c;
    let len = 1, label = numeral(c, a.tonicPc);
    if (isMin(c) && n1 && isDom(n1) && up4(c, n1)) {
      if (!a.minor && deg(c) === 5 && deg(n1) === 10) {
        len = 2; label = "backdoor ii–V";
        if (n2 && deg(n2) === 0 && !isDom(n2)) { len = 3; label = "backdoor ii–V–I"; }
      } else {
        const tpc = mod12(pcOf(n1.root) + 5);
        const lands = n2 && pcOf(n2.root) === tpc && !isDom(n2);
        const minor = lands ? isMin(n2) : kind(c.q) === "half";
        len = lands ? 3 : 2;
        if (!lands) while (flat[i + len + 1] && same(flat[i + len].c, c) && same(flat[i + len + 1].c, n1)) {
          const n3 = flat[i + len + 2] && flat[i + len + 2].c;
          len += 2;
          if (n3 && pcOf(n3.root) === tpc && !isDom(n3)) { len++; break; }
        }
        const landsLate = len % 2 === 1;
        const lastC = flat[i + len - 1].c;
        label = (lands || landsLate ? "ii–V–I" : "ii–V") + of(tpc, landsLate ? isMin(lastC) : minor);
      }
    } else if (isMin(c) && n1 && isMin(n1) && n1.root === c.root && n1.q !== c.q) {
      while (flat[i + len] && isMin(flat[i + len].c) && flat[i + len].c.root === c.root) len++;
      label = "line cliché";
    } else if (isDom(c) && n1 && isDom(n1) && (up4(c, n1) || downHalf(c, n1)) && new Set(flat.slice(i, i + chainLen(i)).map(f => f.c.root)).size >= 3) {
      len = chainLen(i);
      const allHalf = flat.slice(i + 1, i + len).every((f, j) => downHalf(flat[i + j].c, f.c) || f.c.root === flat[i + j].c.root);
      label = allHalf ? "chromatic dominants" : "dominant chain";
    } else if (isDom(c)) {
      if (n1 && up4(c, n1)) label = deg(n1) === 0 && isMin(n1) === a.minor ? "V" : "V" + of(pcOf(n1.root), isMin(n1));
      else if (n1 && downHalf(c, n1)) label = "sub V" + of(pcOf(n1.root), isMin(n1));
      else if (!a.minor && deg(c) === 10 && n1 && deg(n1) === 0) label = "backdoor ♭VII7";
    } else if (kind(c.q) === "dim") {
      label = "passing °7";
    }
    while (flat[i + len] && same(flat[i + len - 1].c, flat[i + len].c)) len++;
    out.push({ label, keys: flat.slice(i, i + len).map(f => f.key) });
    i += len;
  }
  const map = {};
  out.forEach(g => g.keys.forEach((k, j) => { map[k] = { start: j === 0, end: j === g.keys.length - 1, multi: g.keys.length > 1, label: g.label }; }));
  return map;
}

export function tradType(c, nxt, deg, isII, minorKey, isV) {
  const k = kind(c.q), q = c.q;
  const toFourth = nxt && mod12(pcOf(nxt.root) - pcOf(c.root)) === 5;
  const nk = nxt ? kind(nxt.q) : "";
  if (k === "maj") return q.includes("#11") || (!minorKey && [3, 5, 8, 10].includes(deg)) ? "Lydian" : "major";
  if (k === "min") {
    if (q.startsWith("-6") || q.startsWith("-^")) return "mel. minor";
    if (minorKey && deg === 0) return "Aeolian";
    if (!isII && !minorKey && deg === 4) return "Phrygian";
    if (!isII && !minorKey && deg === 9) return "Aeolian";
    return "Dorian";
  }
  if (k === "half") return isII ? "Locrian" : "Locrian ♮2";
  if (k === "dim") return "dim (W–H)";
  if (q.includes("sus")) return "Mixo sus";
  if (q.includes("alt")) return "altered";
  if (q.includes("#11")) return "Lyd. dom.";
  if (toFourth && (nk === "min" || nk === "half")) return "Phryg. dom.";
  if (q.includes("b9")) return "H–W dim";
  if (q.includes("b13") || q.includes("#5")) return "Mixo ♭13";
  if (!toFourth && !isV && [1, 3, 8, 10].includes(deg)) return "Lyd. dom.";
  return "Mixolydian";
}
// parent scale for each chord-scale: [offset from chord root, family]
export const PARENT = {
  "major": [0, "major"], "Lydian": [7, "major"], "Dorian": [10, "major"], "Phrygian": [8, "major"],
  "Aeolian": [3, "major"], "Mixolydian": [5, "major"], "Mixo sus": [5, "major"], "Locrian": [1, "major"],
  "mel. minor": [0, "mel"], "Lyd. dom.": [7, "mel"], "Locrian ♮2": [3, "mel"], "Mixo ♭13": [5, "mel"], "altered": [1, "mel"],
  "Phryg. dom.": [5, "harm"], "H–W dim": [1, "dim"], "dim (W–H)": [0, "dim"]
};
export function bhLabel(c, nxt, deg, isII, minorKey, nm) {
  const k = kind(c.q), q = c.q;
  if (k === "maj") return nm(0) + "6 dim";
  if (k === "min") {
    if (q.startsWith("-6") || q.startsWith("-^") || q === "-" || (minorKey && deg === 0)) return nm(0) + "–6 dim";
    if (isII) return nm(pcOf(nxt.root) - pcOf(c.root)) + "7";
    return nm(5) + "7";
  }
  if (k === "half") return isII ? nm(pcOf(nxt.root) - pcOf(c.root)) + "7" : nm(3) + "–6 dim";
  if (k === "dim") return nm(-1) + "7 family";
  return nm(0) + "7";
}
// 3rd and 7th (or the 6th / 5th where that's the colour)
export function guideTones(c) {
  const k = kind(c.q), q = c.q;
  if (k === "maj") { if (q.includes("sus")) return [5, 7]; if (q.startsWith("^")) return [4, 11]; if (q.startsWith("6")) return [4, 9]; return [4, 7]; }
  if (k === "dom") return q.includes("sus") ? [5, 10] : [4, 10];
  if (k === "min") { if (q.startsWith("-^")) return [3, 11]; if (q.startsWith("-6")) return [3, 9]; if (q === "-") return [3, 7]; return [3, 10]; }
  if (k === "half") return [3, 10];
  return [3, 9];
}
export function chordPcs(c) {
  const r = pcOf(c.root), k = kind(c.q);
  const fifth = k === "half" || k === "dim" ? 6 : /#5|\+/.test(c.q) ? 8 : 7;
  return new Set([0, fifth, ...guideTones(c)].map(x => mod12(r + x)));
}

export function keyLabel(song, shift) {
  const t = detectTonic(song);
  const pc = mod12(t.pc + shift);
  return spell(pc, useSharps(pc, t.minor)) + (t.minor ? "–" : "");
}
