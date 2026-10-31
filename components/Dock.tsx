"use client";
// The player drawer on the right: Band (built-in backing band), Record (Spotify embed) and the page's side panels.
// Collapsed, it shrinks to a slim rail (a floating button on phones) so the chart gets the whole screen. Rendered once in the root layout.
import { useApp, sectionRanges } from "./AppProvider";
import type { Instrument } from "@/lib/band/engine";

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: "piano", label: "Piano" }, { id: "bass", label: "Bass" }, { id: "drums", label: "Drums" },
];

export function Dock() {
  const app = useApp();
  const { prefs, current, bandPlaying, bandFor, band } = app;
  const tab = prefs.dock === "record" ? "record" : "band";
  const size = prefs.dockSize === "hidden" ? "hidden" : "full";
  const sg = bandPlaying ? bandFor : current && current.song;
  const sections = current ? sectionRanges(current.song) : [];

  const onPlay = () => {
    if (!band) return;
    if (band.playing) app.stopBand();
    else app.startBand(current);
  };
  const recLoad = () => {
    const cur = current;
    const s = cur && cur.kind === "set" ? app.setlistById(cur.setId) : app.setlists.find(x => x.spotify);
    if (s && s.spotify) app.playSpotify(s.spotify, false); else app.toast("Link a Spotify playlist on the setlist page first.");
  };

  const open = (t: "band" | "record") => { app.setDockTab(t); app.setDockSize("full"); };

  return (
    <aside id="dock" aria-label="Player" data-tab={tab} data-size={size}>
      <div className="dock-rail" hidden={size !== "hidden"}>
        <button className="rail-btn" id="dock-open" aria-label="Open the player" aria-expanded={false} onClick={() => app.setDockSize("full")}>
          <span aria-hidden="true">‹</span>
        </button>
        <button className="rail-btn" aria-label={bandPlaying ? "Stop the band" : "Play with the band"} disabled={!sg} onClick={onPlay}>
          <span aria-hidden="true">{bandPlaying ? "■" : "▶"}</span>
        </button>
        <button className="rail-btn" data-dock="band" aria-pressed={tab === "band"} onClick={() => open("band")}>Band</button>
        <button className="rail-btn" data-dock="record" aria-pressed={tab === "record"} onClick={() => open("record")}>Rec</button>
      </div>
      <button className="dock-scrim" aria-label="Close the player" tabIndex={-1} hidden={size === "hidden"} onClick={() => app.setDockSize("hidden")} />
      <div className="dock-inner" inert={size === "hidden"}>
        <div className="dock-bar">
          <span className="seg" role="group" aria-label="Sound source">
            {(["band", "record"] as const).map(t => (
              <button key={t} data-dock={t} aria-pressed={tab === t} onClick={() => app.setDockTab(t)}>
                {t === "band" ? "Band" : "Record"}
              </button>
            ))}
          </span>
          <button className="btn icon-btn small" id="dock-size" aria-label="Collapse the player" aria-expanded={true} onClick={() => app.setDockSize("hidden")}>›</button>
          <span className="dock-status" id="band-status">{app.bandStatus}</span>
        </div>
        <div className="dock-body">
          <div className="pane-band">
            <button className="btn primary" id="band-play" disabled={!sg} onClick={onPlay}>{bandPlaying ? "■ Stop" : "▶ Play"}</button>
            <div className="band-main">
              <span className="t" id="band-title">{sg ? sg.title : "Open a tune to play it with the band"}</span>
              <div className="band-ctrls">
                <label htmlFor="band-tempo">Tempo <input id="band-tempo" type="range" min={40} max={320} step={2} value={app.tempo}
                  onChange={e => app.setTempo(+e.target.value)} /> <b id="tempo-val">{app.tempo}</b></label>
                <label htmlFor="band-choruses">Choruses
                  <select id="band-choruses" value={String(prefs.choruses)} onChange={e => app.updatePrefs({ choruses: +e.target.value })}>
                    {[1, 2, 3, 4, 6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label htmlFor="band-loop">
                  <select id="band-loop" value={app.loop} disabled={bandPlaying} onChange={e => app.setLoop(e.target.value)}>
                    <option value="">Whole tune</option>
                    {sections.map(r => <option key={r.from} value={`${r.from}-${r.to}`}>Loop {r.label} (bars {r.from + 1}–{r.to + 1})</option>)}
                  </select>
                </label>
                <label htmlFor="band-countin"><input id="band-countin" type="checkbox" checked={prefs.countIn} onChange={e => app.updatePrefs({ countIn: e.target.checked })} /> Count-in</label>
                <span className="chips" role="group" aria-label="Instruments">
                  {INSTRUMENTS.map(i => (
                    <button key={i.id} className="chip" id={"mute-" + i.id} aria-pressed={!prefs.mute[i.id]}
                      onClick={() => app.setMute(i.id, !prefs.mute[i.id])}>{i.label}</button>
                  ))}
                </span>
              </div>
            </div>
          </div>
          <div className="pane-record">
            <div className="rec-head">
              <b id="rec-title">{app.recTitle}</b>
              <button className="btn small" id="rec-load" onClick={recLoad}>Load this setlist&apos;s playlist</button>
              <label className="toggle" htmlFor="rec-follow"><input id="rec-follow" type="checkbox" checked={app.follow} onChange={e => app.setFollow(e.target.checked)} /> Charts follow the music</label>
              <span className="hint" id="rec-status">{app.recStatus}</span>
            </div>
            {/* Spotify's iFrame API owns this element's contents; React never renders children into it. */}
            <div id="sp-embed" ref={app.embedRef} suppressHydrationWarning />
          </div>
        </div>
        {/* the page on screen portals its side panels in here */}
        <div className="dock-slot" ref={app.setDrawerSlot} />
      </div>
    </aside>
  );
}
