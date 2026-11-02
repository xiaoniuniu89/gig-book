// A small QR encoder: byte mode, error correction M, versions 1–10 (up to 213 bytes). Used for payment links (R11).
// Follows ISO 18004; the mask is chosen with a simplified penalty score (any mask is valid).

// Per version at level M: [ecc codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]
const M_BLOCKS = [
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
];
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) with x^8+x^4+x^3+x^2+1
const EXP: number[] = [], LOG: number[] = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
const mul = (a: number, b: number) => a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0;

function rsEcc(data: number[], n: number): number[] {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ (rem.shift() as number);
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= mul(gen[i + 1], f);
  }
  return rem;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let p = 0, dark = 0;
  for (let a = 0; a < n; a++) for (const row of [true, false]) {
    let run = 1;
    for (let b = 1; b <= n; b++) {
      const same = b < n && (row ? m[a][b] === m[a][b - 1] : m[b][a] === m[b - 1][a]);
      if (same) run++; else { if (run >= 5) p += run - 2; run = 1; }
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

/** The dark modules of a QR code for `text` (UTF-8), or null when it doesn't fit version 10-M. */
export function qrEncode(text: string): boolean[][] | null {
  const bytes = [...new TextEncoder().encode(text)];
  const ver = M_BLOCKS.findIndex(([, g1, d1, g2, d2], i) => g1 * d1 + g2 * d2 >= Math.ceil((4 + (i < 9 ? 8 : 16) + bytes.length * 8) / 8)) + 1;
  if (!ver) return null;
  const [ecLen, g1, d1, g2, d2] = M_BLOCKS[ver - 1];
  const cap = g1 * d1 + g2 * d2;

  // bit stream: mode 0100, count, bytes, terminator, padding
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);

  // blocks, error correction, interleave
  const blocks: number[][] = [];
  for (let i = 0, at = 0; i < g1 + g2; i++) { const len = i < g1 ? d1 : d2; blocks.push(data.slice(at, at + len)); at += len; }
  const eccs = blocks.map(b => rsEcc(b, ecLen));
  const all: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.length) all.push(b[i]); });
  for (let i = 0; i < ecLen; i++) eccs.forEach(e => all.push(e[i]));

  const n = 17 + 4 * ver;
  const grid = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (x: number, y: number, v: boolean) => { grid[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < n && y < n) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[ver - 1];
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mask: number) => { // level M is 00, so the format data is just the mask
    let r = mask;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((mask << 10) | r) ^ 0x5412, b = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, b(i));
    set(8, n - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const v = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const on = ((v >>> i) & 1) === 1, a = n - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, on); set(c, a, on); }
  }

  // data, zigzag from the bottom right
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - v : v;
      if (!fn[y][x] && k < all.length * 8) { grid[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }

  let best = 0, bestScore = Infinity, bestGrid = grid;
  for (let m = 0; m < 8; m++) {
    const g = grid.map((row, y) => row.map((v, x) => fn[y][x] ? v : v !== MASKS[m](x, y)));
    const score = penalty(g);
    if (score < bestScore) { best = m; bestScore = score; bestGrid = g; }
  }
  bestGrid.forEach((r, y) => r.forEach((v, x) => { grid[y][x] = v; }));
  format(best);
  return grid;
}

/** An SVG path (4-module quiet zone included) and its size in modules, for a viewBox of `0 0 size size`. */
export function qrPath(text: string): { size: number; d: string } | null {
  const g = qrEncode(text);
  if (!g) return null;
  let d = "";
  g.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return { size: g.length + 8, d };
}
