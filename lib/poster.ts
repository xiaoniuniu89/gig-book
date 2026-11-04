// Gig poster drawn on a canvas in the Real Book cover look (R10.11). No dependencies; PNG via toBlob, PDF via the browser's print.
export type PosterTemplate = "cover" | "stripe";
export type PosterSize = "a4" | "square";
export interface PosterInfo { band: string; venue: string; date: string; time: string; tickets: string; line: string; members: string[] }

export const POSTER_SIZES: Record<PosterSize, { label: string; w: number; h: number }> = {
  a4: { label: "A4 print", w: 1240, h: 1754 },
  square: { label: "Instagram square", w: 1080, h: 1080 },
};
export const POSTER_TEMPLATES: [PosterTemplate, string][] = [["cover", "Cover band"], ["stripe", "Big stripe"]];

const INK = "#202020", PAPER = "#FBF8EF", COLOURS = { yellow: "#E0E722", orange: "#FFAD00", pink: "#DB3EB1", blue: "#8FA8FF" };
export type PosterColour = keyof typeof COLOURS;
export const POSTER_COLOURS = Object.keys(COLOURS) as PosterColour[];
const DISPLAY = '"Luckiest Guy", "Arial Rounded MT Bold", sans-serif', TYPE = '"Special Elite", "Courier New", monospace';

/** Make sure the web fonts are ready before drawing. */
export async function loadPosterFonts() {
  try { await Promise.all([document.fonts.load(`40px "Luckiest Guy"`), document.fonts.load(`40px "Special Elite"`)]); } catch { /* fall back to system fonts */ }
}

export function prettyDate(iso: string): string {
  const d = /^\d{4}-\d\d-\d\d$/.test(iso) ? new Date(iso + "T12:00:00") : null;
  return d && !isNaN(+d) ? d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : iso;
}

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + w : w;
      if (line && c.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Shrinks the font until the text fits `maxW` on at most `maxLines` lines; returns the lines and the size. */
function fit(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxPx: number, maxW: number, maxLines: number) {
  let px = maxPx, lines: string[] = [];
  for (; px > 18; px -= 4) { c.font = font(px); lines = wrap(c, text, maxW); if (lines.length <= maxLines && lines.every(l => c.measureText(l).width <= maxW)) break; }
  return { lines, px };
}

function cropped(c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); c.restore();
  c.lineWidth = 6; c.strokeStyle = INK; c.strokeRect(x, y, w, h);
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?"; }

/** Photos if there are any; otherwise a row of initials (the placeholder until people have press photos). */
function people(c: CanvasRenderingContext2D, imgs: HTMLImageElement[], names: string[], x: number, y: number, w: number, h: number, colour: string) {
  if (imgs.length) {
    const n = Math.min(imgs.length, 4), gap = 20, cols = n === 3 ? 3 : n === 1 ? 1 : 2, rows = Math.ceil(n / cols);
    const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
    imgs.slice(0, n).forEach((im, i) => cropped(c, im, x + (i % cols) * (cw + gap), y + Math.floor(i / cols) * (ch + gap), cw, ch));
    return;
  }
  const n = Math.max(1, Math.min(names.length, 6)), gap = 24, d = Math.min((w - gap * (n - 1)) / n, h);
  const x0 = x + (w - (d * n + gap * (n - 1))) / 2, y0 = y + (h - d) / 2;
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * (d + gap) + d / 2;
    c.beginPath(); c.arc(cx, y0 + d / 2, d / 2, 0, Math.PI * 2);
    c.fillStyle = colour; c.fill(); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
    c.fillStyle = INK; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `${d * 0.4}px ${DISPLAY}`;
    c.fillText(initials(names[i] || ""), cx, y0 + d / 2 + d * 0.03);
    c.textBaseline = "alphabetic";
  }
}

export function drawPoster(canvas: HTMLCanvasElement, tpl: PosterTemplate, size: PosterSize, colourKey: PosterColour, info: PosterInfo, imgs: HTMLImageElement[]) {
  const { w: W, h: H } = POSTER_SIZES[size], colour = COLOURS[colourKey], sq = size === "square";
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d")!;
  const m = Math.round(W * 0.07), inner = W - m * 2;
  c.textBaseline = "alphabetic"; c.fillStyle = tpl === "stripe" ? colour : PAPER; c.fillRect(0, 0, W, H);
  c.fillStyle = INK;

  const dateLine = [prettyDate(info.date), info.time].filter(Boolean).join(" · ");
  const names = info.members.filter(Boolean);
  // date, venue, the line of text and the ticket link, top to bottom; returns where it ended
  const detail = (x: number, y: number, maxW: number, align: CanvasTextAlign) => {
    c.textAlign = align; c.fillStyle = INK;
    const rows: [string, number][] = [];
    if (dateLine) rows.push([dateLine, sq ? 54 : 72]);
    if (info.venue) rows.push([info.venue, sq ? 44 : 60]);
    for (const [t, px] of rows) {
      const r = fit(c, t, p => `${p}px ${DISPLAY}`, px, maxW, 2);
      for (const l of r.lines) { y += r.px * 1.1; c.font = `${r.px}px ${DISPLAY}`; c.fillText(l, x, y); }
      y += 10;
    }
    if (info.line) {
      const r = fit(c, info.line, p => `${p}px ${TYPE}`, sq ? 30 : 38, maxW, 3);
      for (const l of r.lines) { y += r.px * 1.3; c.font = `${r.px}px ${TYPE}`; c.fillText(l, x, y); }
    }
    if (info.tickets) { y += sq ? 44 : 56; c.font = `${sq ? 28 : 34}px ${TYPE}`; c.fillText("Tickets: " + info.tickets.replace(/^https?:\/\//, ""), x, y); }
    return y;
  };
  const memberLine = (y: number, maxW: number, align: CanvasTextAlign, x: number) => {
    if (!names.length) return;
    const r = fit(c, names.join("  ·  "), p => `${p}px ${TYPE}`, sq ? 28 : 34, maxW, 2);
    c.textAlign = align; c.fillStyle = INK; c.font = `${r.px}px ${TYPE}`;
    r.lines.forEach((l, i) => c.fillText(l, x, y + i * r.px * 1.3));
  };

  if (tpl === "cover") {
    // a Real Book cover: spiral binding down the left, coloured title band across the top
    const bandH = sq ? 330 : 520, sp = Math.round(W * 0.06);
    c.fillStyle = colour; c.fillRect(sp, 0, W - sp, bandH);
    c.fillStyle = INK; c.fillRect(sp, bandH - 6, W - sp, 6);
    for (let y = 30; y < H; y += 56) { c.beginPath(); c.arc(sp / 2, y, 9, 0, Math.PI * 2); c.fill(); }
    c.fillRect(sp - 3, 0, 3, H);
    const x0 = sp + m * 0.7, w = W - x0 - m * 0.7;
    c.textAlign = "left";
    c.font = `26px ${TYPE}`; c.fillText("LIVE", x0, sq ? 70 : 100);
    const t = fit(c, info.band || "Your band", p => `${p}px ${DISPLAY}`, sq ? 170 : 230, w, 3);
    c.font = `${t.px}px ${DISPLAY}`;
    const top = (bandH - t.lines.length * t.px * 1.05) / 2 + t.px * 0.85 + 20;
    t.lines.forEach((l, i) => c.fillText(l, x0, top + i * t.px * 1.05));
    const photoH = sq ? 250 : 560, py = bandH + 40;
    people(c, imgs, names, x0, py, w, photoH, colour);
    const ny = py + photoH + 30;
    memberLine(ny + 20, w, "left", x0);
    detail(x0, ny + (names.length ? (sq ? 40 : 60) : 0), w, "left");
  } else {
    // a bold stripe: coloured poster, photos on top, an ink band with the name, centred lettering
    const photoH = sq ? 330 : 640;
    people(c, imgs, names, m, m, inner, photoH, PAPER);
    const bandY = m + photoH + 40, bandH = sq ? 230 : 330;
    c.fillStyle = INK; c.fillRect(0, bandY, W, bandH);
    const t = fit(c, info.band || "Your band", p => `${p}px ${DISPLAY}`, sq ? 150 : 210, inner, 2);
    c.fillStyle = PAPER; c.textAlign = "center"; c.font = `${t.px}px ${DISPLAY}`;
    const top = bandY + (bandH - t.lines.length * t.px * 1.05) / 2 + t.px * 0.85;
    t.lines.forEach((l, i) => c.fillText(l, W / 2, top + i * t.px * 1.05));
    const y = detail(W / 2, bandY + bandH + 20, inner, "center");
    memberLine(Math.min(H - m, y + (sq ? 50 : 80)), inner, "center", W / 2);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => no(new Error("image")); i.src = url; });
}
