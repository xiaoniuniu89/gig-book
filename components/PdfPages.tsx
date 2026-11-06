"use client";
// A PDF shown as clean white pages at the width of the chart, for reading on a stand (no browser PDF viewer, no toolbar).
// pdf.js loads only when a PDF is opened; each page is drawn at the screen's sharpness and redrawn when the width changes.
import { useEffect, useRef, useState } from "react";

type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};

async function load(url: string): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return (await pdfjs.getDocument({ url, isEvalSupported: false }).promise) as unknown as PdfDoc;
}
// opened PDFs stay open (the last few), so flipping between iReal and a PDF tab doesn't download and read it again
const docs = new Map<string, Promise<PdfDoc>>();
function openPdf(url: string): Promise<PdfDoc> {
  const key = url.split("?")[0]; // the file, whatever signed link it came with
  let p = docs.get(key);
  if (!p) {
    p = load(url);
    p.catch(() => docs.delete(key));
    docs.set(key, p);
    if (docs.size > 6) { const [old, d] = docs.entries().next().value!; docs.delete(old); d.then(x => x.destroy(), () => {}); }
  } else { docs.delete(key); docs.set(key, p); } // most recently used last
  return p;
}

const READABLE = 720;

/** `fit`: on screens 700px or wider, each page is sized so it fits the window height minus this many pixels. */
export function PdfPages({ url, name, fit }: { url: string; name: string; fit?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null | undefined>(undefined);
  const [width, setWidth] = useState(0);
  const [tall, setTall] = useState(0);

  useEffect(() => {
    let live = true;
    setDoc(undefined);
    openPdf(url).then(x => { if (live) setDoc(x); }, () => { if (live) setDoc(null); });
    return () => { live = false; };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const size = () => setTall(fit !== undefined && window.innerWidth >= 700 ? Math.max(300, window.innerHeight - fit) : 0);
    const ro = new ResizeObserver(([e]) => { clearTimeout(t); t = setTimeout(() => { setWidth(Math.round(e.contentRect.width)); size(); }, 120); });
    ro.observe(el);
    size();
    window.addEventListener("resize", size);
    return () => { ro.disconnect(); clearTimeout(t); window.removeEventListener("resize", size); };
  }, [fit]);

  return (
    <div className="pdf-pages" ref={box} aria-label={name}>
      {doc === undefined && <p className="hint pad">Loading…</p>}
      {doc === null && <p className="hint pad">Couldn&apos;t show this PDF. Use Download to open it.</p>}
      {doc && width > 0 && Array.from({ length: Math.min(doc.numPages, 30) }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={width} tall={tall} />)}
    </div>
  );
}

function Page({ doc, n, width, tall }: { doc: PdfDoc; n: number; width: number; tall: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { promise: Promise<void>; cancel(): void } | null = null, live = true;
    doc.getPage(n).then(p => {
      const c = canvas.current;
      if (!live || !c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const base = p.getViewport({ scale: 1 });
      // the whole page in view, but never narrower than READABLE (a short laptop screen scrolls a little instead)
      const w = tall ? Math.min(width, Math.max(READABLE, Math.round(tall * base.width / base.height))) : width;
      c.style.width = w + "px";
      const vp = p.getViewport({ scale: (w / base.width) * dpr });
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.aspectRatio = base.width + " / " + base.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      task.promise.catch(() => { /* cancelled by a newer width */ });
    }, () => { /* a page that won't load just stays blank */ });
    return () => { live = false; task?.cancel(); };
  }, [doc, n, width, tall]);
  return <canvas ref={canvas} className="pdf-page" aria-label={"Page " + n} />;
}
