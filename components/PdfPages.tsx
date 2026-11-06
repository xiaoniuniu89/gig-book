"use client";
// A PDF shown as clean white pages at the width of the chart, for reading on a stand (no browser PDF viewer, no toolbar).
// pdf.js loads only when a PDF is opened; each page is drawn at the screen's sharpness and redrawn when the width changes.
import { useEffect, useRef, useState } from "react";

type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};

async function openPdf(url: string): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return (await pdfjs.getDocument({ url, isEvalSupported: false }).promise) as unknown as PdfDoc;
}

export function PdfPages({ url, name }: { url: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null | undefined>(undefined);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true, d: PdfDoc | null = null;
    setDoc(undefined);
    openPdf(url).then(x => { d = x; if (live) setDoc(x); else void x.destroy(); }, () => { if (live) setDoc(null); });
    return () => { live = false; void d?.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([e]) => { clearTimeout(t); t = setTimeout(() => setWidth(Math.round(e.contentRect.width)), 120); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <div className="pdf-pages" ref={box} aria-label={name}>
      {doc === undefined && <p className="hint pad">Loading…</p>}
      {doc === null && <p className="hint pad">Couldn&apos;t show this PDF. Use Download to open it.</p>}
      {doc && width > 0 && Array.from({ length: Math.min(doc.numPages, 30) }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={width} />)}
    </div>
  );
}

function Page({ doc, n, width }: { doc: PdfDoc; n: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { promise: Promise<void>; cancel(): void } | null = null, live = true;
    doc.getPage(n).then(p => {
      const c = canvas.current;
      if (!live || !c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: (width / base.width) * dpr });
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.aspectRatio = base.width + " / " + base.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      task.promise.catch(() => { /* cancelled by a newer width */ });
    }, () => { /* a page that won't load just stays blank */ });
    return () => { live = false; task?.cancel(); };
  }, [doc, n, width]);
  return <canvas ref={canvas} className="pdf-page" aria-label={"Page " + n} />;
}
