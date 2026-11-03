"use client";
// Sheet music from MusicXML (.musicxml, .xml, .mxl), drawn by OpenSheetMusicDisplay (loaded on first use) with live transposition.
import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

type OsmdMod = typeof import("opensheetmusicdisplay");
let lib: Promise<OsmdMod> | null = null;
const load = () => (lib ??= import("opensheetmusicdisplay"));

const fmtShift = (n: number) => (n === 0 ? "Original key" : (n > 0 ? "+" : "−") + Math.abs(n) + (Math.abs(n) === 1 ? " semitone" : " semitones"));

/** Draws a MusicXML URL or File/Blob, transposed by `transpose` semitones. `controls` adds its own −/+ bar when no parent bar drives `transpose`. */
export function MusicXml({ src, name, transpose, controls }: {
  src: string | Blob;
  name?: string;
  transpose?: number;
  controls?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const [ownShift, setOwnShift] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bad, setBad] = useState(false);
  const shift = transpose ?? ownShift;
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  // Load the MusicXML document once per `src`
  useEffect(() => {
    let gone = false;
    setLoading(true);
    setBad(false);
    const run = async () => {
      try {
        const [m, blob] = await Promise.all([
          load(),
          typeof src === "string" ? fetch(src).then(r => { if (!r.ok) throw new Error(); return r.blob(); }) : Promise.resolve(src),
        ]);
        if (gone || !el.current) return;
        el.current.innerHTML = "";
        const inst = new m.OpenSheetMusicDisplay(el.current, {
          autoResize: false,
          backend: "svg",
          drawingParameters: "compacttight",
          drawPartNames: false,
          drawPartAbbreviations: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
        });
        inst.TransposeCalculator = new m.TransposeCalculator();
        const rules = inst.EngravingRules as unknown as { SimpleChordSymbolSpelling?: boolean };
        rules.SimpleChordSymbolSpelling = true;
        await inst.load(blob, name || "Score");
        if (gone || !el.current) return;
        if (inst.Sheet) inst.Sheet.Transpose = shiftRef.current;
        inst.updateGraphic();
        inst.render();
        osmd.current = inst;
        setLoading(false);
      } catch {
        if (!gone) { setBad(true); setLoading(false); }
      }
    };
    void run();
    return () => { gone = true; osmd.current = null; };
  }, [src, name]);

  // Apply transpose changes without re-fetching the file
  useEffect(() => {
    const inst = osmd.current;
    if (!inst || !inst.Sheet || loading || bad) return;
    try {
      if (inst.Sheet.Transpose !== shift) {
        inst.Sheet.Transpose = shift;
        inst.updateGraphic();
        inst.render();
      }
    } catch { /* ignore transient layout errors */ }
  }, [shift, loading, bad]);

  // Reflow systems when container width changes (phone rotation, drawer toggle, fullscreen)
  useEffect(() => {
    const box = el.current;
    if (!box) return;
    let lastW = box.clientWidth;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      const w = box.clientWidth;
      if (!w || Math.abs(w - lastW) < 8) return;
      lastW = w;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const inst = osmd.current;
        if (inst && inst.Sheet) {
          try { inst.render(); } catch { /* ignore */ }
        }
      }, 120);
    });
    ro.observe(box);
    return () => { ro.disconnect(); window.clearTimeout(timer); };
  }, []);

  const step = (d: number) => setOwnShift(s => (((s + d) % 12) + 18) % 12 - 6);

  return (
    <div className="musicxml">
      {controls && !bad && (
        <div className="musicxml-bar">
          <span className="keybox" aria-label="Transpose score">
            <button type="button" aria-label="Transpose down a half step" onClick={() => step(-1)}>−</button>
            <b>{fmtShift(shift)}</b>
            <button type="button" aria-label="Transpose up a half step" onClick={() => step(1)}>+</button>
          </span>
          {ownShift !== 0 && <button type="button" className="btn small" onClick={() => setOwnShift(0)}>Reset key</button>}
        </div>
      )}
      {loading && <p className="hint">Loading score…</p>}
      {bad && <p className="hint">Couldn&apos;t read that MusicXML file.</p>}
      <div ref={el} className="musicxml-staff" aria-label={name || "Sheet music"} role="img" />
    </div>
  );
}
