"use client";
// Focus / chart view (R3): only the chart, big, with a slim bar. Swipe or arrow keys move through the setlist.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, songHref, type Current } from "../AppProvider";
import { ChartHost } from "./SongView";
import { chartHTML } from "@/lib/chart";
import { keyLabel } from "@/lib/theory";
import { song } from "@/lib/songs";
import { FileChart, useChartChoice } from "../Attachments";
import type { Attachment } from "@/lib/data/types";

/** What the view shows. R3.4 adds an attached PDF/image kind here. */
export type ChartSource = { kind: "ireal" } | { kind: "file"; att: Attachment };

/** /set/[id]/[index]/chart */
export function SetChartView() {
  const params = useParams<{ id: string; index: string }>();
  const id = decodeURIComponent(params.id), idx = Number(params.index);
  const { ready, setlists, ensureSetlist } = useApp();
  const [missing, setMissing] = useState(false);
  const s = setlists.find(x => x.id === id);
  const raw = s && Number.isInteger(idx) ? s.items[idx]?.raw : undefined;
  useEffect(() => {
    if (!ready || s) return;
    let gone = false;
    ensureSetlist(id).then(f => { if (!gone && !f) setMissing(true); });
    return () => { gone = true; };
  }, [ready, s, id, ensureSetlist]);
  const setId = s?.id;
  const cur = useMemo<Current | null>(() => (setId && raw ? { kind: "set", setId, itemIdx: idx, song: song(raw) } : null), [setId, raw, idx]);
  const prev = s && idx > 0 ? songHref(id, idx - 1) + "/chart" : "";
  const next = s && idx < s.items.length - 1 ? songHref(id, idx + 1) + "/chart" : "";
  const itemId = s && Number.isInteger(idx) ? s.items[idx]?.id : undefined;
  return <Focus cur={cur} back={songHref(id, idx)} prev={prev} next={next} missing={missing || !!(s && !raw)} tune={setId && itemId ? { setlistId: setId, itemId } : undefined} />;
}

/** /library/[playlistId]/[index]/chart */
export function LibraryChartView() {
  const params = useParams<{ playlistId: string; index: string }>();
  const plId = decodeURIComponent(params.playlistId), idx = Number(params.index);
  const app = useApp();
  const p = app.library.find(x => x.id === plId);
  const raw = p && Number.isInteger(idx) ? p.songs[idx] : undefined;
  const cur = useMemo<Current | null>(() => (p && raw ? { kind: "lib", plId: p.id, songIdx: idx, song: song(raw) } : null), [p, raw, idx]);
  const base = "/library/" + encodeURIComponent(plId) + "/";
  return <Focus cur={cur} back={base + idx} missing={app.ready && !cur}
    prev={p && idx > 0 ? base + (idx - 1) + "/chart" : ""} next={p && idx < p.songs.length - 1 ? base + (idx + 1) + "/chart" : ""} />;
}

function Focus({ cur, back, prev, next, missing, tune }: {
  cur: Current | null; back: string; prev: string; next: string; missing: boolean; tune?: { setlistId: string; itemId: string };
}) {
  const app = useApp();
  const pick = useChartChoice(app.store, tune?.setlistId, tune?.itemId); // R3.4: a PDF/image you picked for this tune
  const [showIreal, setShowIreal] = useState(false); // overrides the picked file for this view
  useEffect(() => setShowIreal(false), [tune?.itemId]);
  const router = useRouter();
  const { prefs, setCurrent } = app;
  const [fs, setFs] = useState<"no" | "off" | "on">("no");
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { if (cur) setCurrent(cur); }, [cur, setCurrent]);
  useEffect(() => () => setCurrent(null), [setCurrent]);

  // keep the screen awake while open; a hidden tab loses the lock, so ask again when it returns
  useEffect(() => {
    let lock: WakeLockSentinel | null = null, gone = false;
    const get = async () => {
      try {
        const l = await navigator.wakeLock?.request("screen");
        if (!l) return;
        if (gone) l.release().catch(() => {}); else lock = l;
      } catch { /* unsupported or refused */ }
    };
    const vis = () => { if (document.visibilityState === "visible") get(); };
    get();
    document.addEventListener("visibilitychange", vis);
    return () => { gone = true; document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, []);

  // fullscreen button only where the API exists (not iOS Safari)
  useEffect(() => {
    if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) return;
    const sync = () => setFs(document.fullscreenElement ? "on" : "off");
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowLeft" && prev) router.replace(prev);
      else if (e.key === "ArrowRight" && next) router.replace(next);
      else if (e.key === "Escape" && !document.fullscreenElement) router.push(back);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [prev, next, back, router]);

  const sg = cur?.song;
  const shift = cur ? app.shiftOf(cur) : 0;
  const html = useMemo(() => sg ? chartHTML(sg, { shift, mode: prefs.mode, sc: prefs.sc, tn: prefs.tn, fn: prefs.fn }) : "",
    [sg, shift, prefs.mode, prefs.sc, prefs.tn, prefs.fn]);
  const file = pick.att && !showIreal ? pick.att : null;
  const source: ChartSource = file ? { kind: "file", att: file } : { kind: "ireal" };

  if (!cur || !sg) return (
    <div className="focus"><div className="focus-body">
      {missing ? <><h2>Tune not found</h2><Link className="btn" href={back}>Back</Link></> : <p className="hint">Loading…</p>}
    </div></div>
  );

  const tr = (d: number) => {
    app.setShift(cur, (((shift + d) % 12) + 18) % 12 - 6);
    if (app.band && app.band.playing && app.bandFor === sg) setTimeout(() => app.startBand(cur), 0);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current; start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy)) return; // too short or mostly vertical
    const to = dx < 0 ? next : prev;
    if (to) router.replace(to);
  };
  const playing = app.bandPlaying && app.bandFor === sg;
  const arrow = (href: string, label: string, ch: string) => href
    ? <Link className="btn icon-btn" href={href} replace aria-label={label}>{ch}</Link>
    : <a className="btn icon-btn" aria-disabled="true" aria-label={label}>{ch}</a>;

  return (
    <div className="focus" role="region" aria-label="Chart view">
      <div className="focus-bar">
        <Link className="btn icon-btn" href={back} aria-label="Close the chart view">×</Link>
        {arrow(prev, "Previous tune", "‹")}
        {arrow(next, "Next tune", "›")}
        <div className="focus-title"><b>{sg.title}</b><span>{keyLabel(sg, shift)}</span></div>
        <span className="keybox" aria-label="Transpose">
          <button aria-label="Transpose down a half step" onClick={() => tr(-1)}>−</button>
          <button aria-label="Transpose up a half step" onClick={() => tr(1)}>+</button>
        </span>
        {pick.att && (
          <button className="btn" aria-pressed={!!file} aria-label={file ? "Show the iReal chart" : "Show the attached " + pick.att.kind}
            onClick={() => setShowIreal(v => !v)}>{file ? "iReal" : pick.att.kind === "pdf" ? "PDF" : "Image"}</button>
        )}
        <button className="btn icon-btn" aria-label={playing ? "Stop the band" : "Play with the band"} disabled={!app.band}
          onClick={() => playing ? app.stopBand() : app.startBand(cur)}>{playing ? "■" : "▶"}</button>
        {fs !== "no" && <button className="btn icon-btn" aria-label={fs === "on" ? "Leave full screen" : "Full screen"}
          onClick={() => (fs === "on" ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>⛶</button>}
      </div>
      <div className="focus-body" onPointerDown={e => { start.current = file ? null : { x: e.clientX, y: e.clientY }; }}
        onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
        {source.kind === "ireal" ? <ChartHost html={html} live={playing} fit /> : <FileChart store={app.store} a={source.att} />}
      </div>
    </div>
  );
}
