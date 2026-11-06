// Press kit as a one-page PDF (R11, R10.8): a print-styled page in a new window and the browser's Print > Save as PDF.
// No PDF library. Everything that goes in is escaped; the bio is sanitised again here.
import { qrPath } from "./qr";
import { bioToHtml, escapeHtml as e } from "./richtext";

export interface KitPrint {
  name: string;
  bio: string;
  instruments: string[];
  /** label, value (shown as written, so a printed page still has readable URLs). */
  contact: { label: string; value: string }[];
  /** The main photo, as an address the new window can load. */
  photoUrl?: string;
  /** The public page, when it's on: shown as a QR code and a link. */
  pageUrl?: string;
}

const CSS = `@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:11pt/1.45 Georgia,serif;color:#111;margin:0}
.kit{display:grid;grid-template-columns:1fr 62mm;gap:8mm}h1{font-size:26pt;margin:0 0 2mm}.tags{color:#555;margin:0 0 5mm}
h2{font:700 9pt/1 sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:6mm 0 2mm;border-bottom:1px solid #ccc;padding-bottom:1mm}
.bio p{margin:0 0 2.5mm}.bio h3{font-size:12pt;margin:3mm 0 1mm}.bio ul,.bio ol{margin:0 0 2.5mm;padding-left:6mm}.bio a{color:#111}
img{width:100%;max-height:80mm;object-fit:cover;border-radius:2mm}dl{margin:0;font:9.5pt/1.4 sans-serif}dt{color:#555;margin-top:1.5mm}dd{margin:0;overflow-wrap:anywhere}
.qr{width:30mm;height:30mm;display:block}.qrbox{margin-top:6mm;font:8.5pt/1.3 sans-serif;overflow-wrap:anywhere}`;

export function kitHtml(k: KitPrint): string {
  const q = k.pageUrl ? qrPath(k.pageUrl) : null;
  const bio = bioToHtml(k.bio);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(k.name)} · Press kit</title><style>${CSS}</style></head><body><div class="kit">
<main><h1>${e(k.name)}</h1>${k.instruments.length ? `<p class="tags">${e(k.instruments.join(" · "))}</p>` : ""}
${bio ? `<h2>Bio</h2><div class="bio">${bio}</div>` : ""}</main>
<aside>${k.photoUrl ? `<img src="${e(k.photoUrl)}" alt="">` : ""}
${k.contact.length ? `<h2>Contact and links</h2><dl>${k.contact.map(c => `<dt>${e(c.label)}</dt><dd>${e(c.value)}</dd>`).join("")}</dl>` : ""}
${q && k.pageUrl ? `<div class="qrbox"><svg class="qr" viewBox="0 0 ${q.size} ${q.size}" shape-rendering="crispEdges"><rect width="${q.size}" height="${q.size}" fill="#fff"/><path d="${q.d}" fill="#000"/></svg>${e(k.pageUrl)}</div>` : ""}
</aside></div></body></html>`;
}

/** Open the print dialog for the kit (choose "Save as PDF"). Call it straight from a click so the window isn't blocked. */
export function openPrintWindow(): Window | null { return window.open("", "_blank"); }
export function printKit(w: Window, k: KitPrint) {
  w.document.open(); w.document.write(kitHtml(k)); w.document.close();
  const go = () => { w.focus(); w.print(); };
  const img = w.document.querySelector("img");
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 50);
}
