"use client";
// The player drawer on the right: Band (built-in backing band), Record (YouTube or Spotify player) and the page's side panels.
// Collapsed, it shrinks to a slim rail (a floating button on phones) so the chart gets the whole screen. Rendered once in the root layout.
import { useApp, sectionRanges } from "./AppProvider";
import { Info } from "./Info";
import { PlaybackHelpLink, useMyPlayback } from "./PlaybackHelp";
import { Icon } from "./Icon";
import { PREMIUM_NOTE, YOUTUBE_SIGN_IN } from "./YoutubePremium";
import { tuneQueueItem } from "@/lib/youtube/queue";
import { songKey } from "@/lib/songs";
import { GENERAL_HINT } from "@/lib/playback";
import type { Instrument } from "@/lib/band/engine";

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: "piano", label: "Piano" }, { id: "bass", label: "Bass" }, { id: "drums", label: "Drums" },
];

export function Dock() {
  const app = useApp();
  const mine = useMyPlayback();
  const { prefs, current, bandPlaying, bandFor, band } = app;
  const tab = prefs.dock === "record" ? "record" : "band";
  const size = prefs.dockSize === "hidden" ? "hidden" : "full";
  const sg = bandPlaying ? bandFor : current && current.song;
  const sections = current ? sectionRanges(current.song) : [];

  const onPlay = () => {
    if (!band) return;
    if (band.playing) app.stopBand();
    else app.startBand(current, { loopAll: current?.kind === "lick" }); // a lick's chords go round until you stop
  };
  const isLick = current?.kind === "lick";
  const recLoad = () => {
    const cur = current;
    const s = cur && cur.kind === "set" ? app.setlistById(cur.setId) : undefined;
    if (s && s.spotify) app.playSpotify(s.spotify, false);
  };

  const yTube = app.settings.player === "youtube";
  const item = current && current.kind === "set" ? app.itemOf(current)
    : current && current.kind === "arr" ? app.arrangements.find(a => a.id === current.arrId) : undefined;
  const playTune = () => {
    if (!current || current.kind === "lick") return;
    const ref = current.kind === "set" ? { setId: current.setId, idx: current.itemIdx } : undefined;
    void app.playYoutube([tuneQueueItem(current.song, item?.versions, ref)]);
  };

  // this tune's video is the one loaded: Play/Pause and Restart instead of starting it again
  const thisTune = !!(app.ytNow && current && current.kind !== "lick" && app.ytNow.key === songKey(current.song.raw));
  const open = (t: "band" | "record") => { app.setDockTab(t); app.setDockSize("full"); };

  return (
    <aside id="dock" aria-label="Player" data-tab={tab} data-size={size}>
      <div className="dock-rail" data-tour="player" hidden={size !== "hidden"}>
        <button className="rail-btn" id="dock-open" aria-label="Open the player" aria-expanded={false} onClick={() => app.setDockSize("full")}>
          <span aria-hidden="true">‹</span>
        </button>
        <button className="rail-btn" aria-label={bandPlaying ? "Stop the band" : "Play with the band"} disabled={!sg} onClick={onPlay}>
          <span aria-hidden="true">{bandPlaying ? "■" : "▶"}</span>
        </button>
        <button className="rail-btn" data-dock="band" aria-pressed={tab === "band"} onClick={() => open("band")}>Play along</button>
        <button className="rail-btn" data-dock="record" aria-pressed={tab === "record"} onClick={() => open("record")}>Listen</button>
      </div>
      <button className="dock-scrim" aria-label="Close the player" tabIndex={-1} hidden={size === "hidden"} onClick={() => app.setDockSize("hidden")} />
      <div className="dock-inner" inert={size === "hidden"}>
        <div className="dock-bar">
          <span className="seg" role="group" aria-label="Sound source" data-tour="player">
            {(["band", "record"] as const).map(t => (
              <button key={t} data-dock={t} aria-pressed={tab === t} onClick={() => app.setDockTab(t)}>
                {t === "band" ? "Play along" : "Listen"}
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
                {!isLick && <label htmlFor="band-choruses">Choruses
                  <select id="band-choruses" value={String(prefs.choruses)} onChange={e => app.updatePrefs({ choruses: +e.target.value })}>
                    {[1, 2, 3, 4, 6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>}
                {!isLick && <label htmlFor="band-loop">
                  <select id="band-loop" value={app.loop} disabled={bandPlaying} onChange={e => app.setLoop(e.target.value)}>
                    <option value="">Whole tune</option>
                    {sections.map(r => <option key={r.from} value={`${r.from}-${r.to}`}>Loop {r.label} (bars {r.from + 1}–{r.to + 1})</option>)}
                  </select>
                </label>}
                <label htmlFor="band-countin"><input id="band-countin" type="checkbox" checked={prefs.countIn} onChange={e => app.updatePrefs({ countIn: e.target.checked })} /> Count-in</label>
                <span className="chips" role="group" aria-label="Instruments">
                  {INSTRUMENTS.map(i => (
                    <button key={i.id} className="chip" id={"mute-" + i.id} aria-pressed={!prefs.mute[i.id]}
                      onClick={() => app.setMute(i.id, !prefs.mute[i.id])}>{i.label}</button>
                  ))}
                </span>
              </div>
              <details className="band-more">
                <summary>More settings</summary>
                <div className="mixer" role="group" aria-label="Levels">
                  {INSTRUMENTS.map(i => (
                    <label key={i.id} htmlFor={"lvl-" + i.id}>{i.label}
                      <input id={"lvl-" + i.id} type="range" min={0} max={1.5} step={0.05} value={prefs.levels[i.id] ?? 1}
                        onChange={e => app.setLevel(i.id, +e.target.value)} />
                    </label>
                  ))}
                </div>
                <div className="band-ctrls">
                  <label htmlFor="key-step">Change key
                    <select id="key-step" value={String(prefs.keyStep)} disabled={bandPlaying} onChange={e => app.updatePrefs({ keyStep: +e.target.value })}>
                      <option value="0">Never</option>
                      <option value="1">Up a half step</option>
                      <option value="2">Up a whole step</option>
                      <option value="5">Round the cycle of 4ths</option>
                      <option value="7">Round the cycle of 5ths</option>
                      <option value="-1">Down a half step</option>
                    </select>
                  </label>
                  {prefs.keyStep !== 0 && <label htmlFor="key-every">every
                    <select id="key-every" value={String(prefs.keyEvery)} disabled={bandPlaying} onChange={e => app.updatePrefs({ keyEvery: +e.target.value })}>
                      <option value="0">time round</option>
                      {[2, 4, 8, 16].map(n => <option key={n} value={n}>{n} bars</option>)}
                    </select>
                  </label>}
                </div>
                {bandPlaying && prefs.keyStep !== 0 && <p className="hint">Stop the band to change these.</p>}
              </details>
            </div>
          </div>
          <div className="pane-record">
            <div className="rec-head">
              <b id="rec-title">{app.recIdle && <Icon name={app.settings.player} size={16} />} {app.recTitle}</b>
              {(app.recIdle ? yTube : app.recKind === "youtube")
                ? <Info label="About playing recordings here">
                    YouTube plays whole songs on every device. It may show ads. {PREMIUM_NOTE}{" "}
                    <a className="btn small" href={YOUTUBE_SIGN_IN} target="_blank" rel="noopener noreferrer"><Icon name="youtube" size={16} /> Connect YouTube Premium</a>
                  </Info>
                : <Info label="About playing recordings here">{mine ? mine.hint : GENERAL_HINT} <PlaybackHelpLink /></Info>}
              {yTube && current && current.kind !== "lick" && (thisTune
                ? <>
                    <button className="btn small" id="rec-play-tune" onClick={app.ytToggle}>{app.ytPlaying ? "❚❚ Pause" : "▶ Play"}</button>
                    <button className="btn icon-btn small" aria-label="Play from the start" title="Play from the start" onClick={playTune}>↺</button>
                  </>
                : <button className="btn small" id="rec-play-tune" onClick={playTune}><Icon name="youtube" size={16} /> Play this tune</button>)}
              {app.recKind === "youtube" && app.ytPos && app.ytPos.count > 1 && <>
                <button className="btn icon-btn small" aria-label="Previous video" disabled={app.ytPos.pos === 0} onClick={() => app.ytStep(-1)}>⏮</button>
                <button className="btn icon-btn small" aria-label="Next video" disabled={app.ytPos.pos >= app.ytPos.count - 1} onClick={() => app.ytStep(1)}>⏭</button>
              </>}
              {/* only on a setlist tune whose setlist has a playlist; elsewhere there's no "this setlist" */}
              {!yTube && current?.kind === "set" && app.setlistById(current.setId)?.spotify &&
                <button className="btn small" id="rec-load" onClick={recLoad}>Load this setlist&apos;s playlist</button>}
              {/* only means something while a whole setlist plays: the chart turns to each tune as it starts */}
              {(app.recTitle === "Setlist" || app.recTitle === "Playlist") &&
                <label className="toggle" htmlFor="rec-follow"><input id="rec-follow" type="checkbox" checked={app.follow} onChange={e => app.setFollow(e.target.checked)} /> Charts follow the music</label>}
              <span className="hint" id="rec-status" role="status">
                {app.recStatus.startsWith("Finding") && <span className="spinner" aria-hidden="true" />}
                {app.recIdle && !app.recStatus ? "Nothing playing. Find a recording of a tune to hear it here." : app.recStatus}
              </span>
            </div>
            {/* Spotify's iFrame API owns this element's contents; React never renders children into it. */}
            <div id="sp-embed" ref={app.embedRef} hidden={app.recKind === "youtube"} suppressHydrationWarning />
            {/* YouTube's player owns this one the same way */}
            <div id="yt-embed" ref={app.ytEmbedRef} hidden={app.recKind !== "youtube"} suppressHydrationWarning />
          </div>
        </div>
        {/* the page on screen portals its side panels in here */}
        <div className="dock-slot" ref={app.setDrawerSlot} />
      </div>
    </aside>
  );
}
