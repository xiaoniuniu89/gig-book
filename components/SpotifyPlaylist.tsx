"use client";
// "Make Spotify playlist" (#45): one recording per tune (the saved one, else the best search match), set 1 then set 2,
// then make the playlist in the user's own Spotify account and link it to the setlist.
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { song } from "@/lib/songs";
import { searchTracks } from "@/lib/spotify/client";
import { disconnectSpotify, makePlaylist, spotifyConnected, startConnect } from "@/lib/spotify/account";
import { webUrl } from "@/lib/spotify/uri";
import type { Setlist, Version } from "@/lib/data/types";

interface Row { id: string; title: string; set: number; pick: Version | null; options: Version[] | null; saved: boolean; skip: boolean }

const composerName = (c: string) => c.split(" ").reverse().join(" ").replace(/"/g, "").trim();
const asVersion = (t: { uri: string; name: string; artists: string }): Version => ({ uri: t.uri, name: t.name, artists: t.artists });

/** Recordings for a tune: composer as artist first, then jazz recordings, then anything with the title. */
async function candidates(title: string, composer: string): Promise<Version[]> {
  const t = `track:"${title.replace(/"/g, "")}"`;
  const who = composerName(composer);
  const runs = await Promise.allSettled([
    who ? searchTracks(`${t} artist:"${who}"`, 5) : Promise.resolve([]),
    searchTracks(`${t} genre:jazz`, 10),
    searchTracks(t, 10),
  ]);
  if (runs.every(r => r.status === "rejected")) throw (runs[2] as PromiseRejectedResult).reason;
  const seen = new Set<string>(), out: Version[] = [];
  for (const r of runs) if (r.status === "fulfilled") for (const x of r.value) if (!seen.has(x.uri)) { seen.add(x.uri); out.push(asVersion(x)); }
  return out.slice(0, 8);
}

export function SpotifyPlaylist({ s, onClose }: { s: Setlist; onClose: () => void }) {
  const app = useApp();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState(s.name);
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const linked = s.spotify?.startsWith("spotify:playlist:") ? s.spotify : null;

  useEffect(() => {
    spotifyConnected().then(setConnected, e => { setConnected(false); setErr(e instanceof Error ? e.message : String(e)); });
  }, []);

  // find a recording for every tune once connected
  useEffect(() => {
    if (!connected) return;
    let gone = false;
    const items = [...s.items].sort((a, b) => a.set - b.set);
    const base: Row[] = items.map(it => {
      const v = it.versions[0] ?? null;
      return { id: it.id, title: song(it.raw).title, set: it.set, pick: v, options: v ? it.versions : null, saved: !!v, skip: false };
    });
    setRows(base);
    (async () => {
      for (let i = 0; i < items.length; i += 4) {
        const batch = items.slice(i, i + 4).filter(it => !it.versions.length);
        const found = await Promise.all(batch.map(it => { const sg = song(it.raw); return candidates(sg.title, sg.composer).catch(() => [] as Version[]); }));
        if (gone) return;
        setRows(r => r && r.map(x => { const k = batch.findIndex(b => b.id === x.id); return k < 0 ? x : { ...x, options: found[k], pick: found[k][0] ?? null }; }));
      }
    })();
    return () => { gone = true; };
  }, [connected, s.items]);

  const change = async (id: string) => {
    const r = rows?.find(x => x.id === id);
    if (!r || (r.options && !r.saved)) return;
    const it = s.items.find(x => x.id === id);
    if (!it) return;
    const sg = song(it.raw);
    const more = await candidates(sg.title, sg.composer).catch(() => [] as Version[]);
    const seen = new Set(it.versions.map(v => v.uri));
    setRows(rs => rs && rs.map(x => x.id === id ? { ...x, saved: false, options: [...it.versions, ...more.filter(v => !seen.has(v.uri))] } : x));
  };
  const pick = (id: string, uri: string) => setRows(rs => rs && rs.map(x => x.id !== id ? x
    : uri === "" ? { ...x, skip: true } : { ...x, skip: false, pick: x.options?.find(v => v.uri === uri) ?? x.pick }));

  const uris = (rows ?? []).filter(r => !r.skip && r.pick).map(r => (r.pick as Version).uri);
  const pending = !!rows?.some(r => r.options === null);

  const create = async (update?: string) => {
    if (busy || !uris.length) return;
    setBusy(true); setErr("");
    try {
      const uri = await makePlaylist({ name: name.trim() || s.name, public: pub, uris, update });
      if (uri !== s.spotify) app.updateSetlist(s.id, x => ({ ...x, spotify: uri }));
      setMade(uri);
      app.toast(update ? "Playlist updated." : "Playlist made.");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) setConnected(false);
      setErr(e instanceof Error ? e.message : "Couldn't make the playlist.");
    }
    setBusy(false);
  };

  if (connected === null) return <p className="hint">Checking your Spotify connection…</p>;

  if (!connected) return (
    <div className="sp-make">
      <p>Connect your Spotify account and we&apos;ll make a playlist of this setlist in it, one recording per tune.</p>
      {err && <p className="flag" role="alert">{err}</p>}
      <div className="row-btns">
        <button className="btn primary" id="sp-connect" onClick={() => startConnect(location.pathname)}><Icon name="music" size={18} /> Connect Spotify</button>
        <button className="btn" onClick={onClose}>Not now</button>
      </div>
      <p className="hint">Spotify playlists are in early access. If Spotify says the app isn&apos;t available to you, send us feedback with the email your Spotify account uses.</p>
    </div>
  );

  if (made) return (
    <div className="sp-make">
      <p>Your playlist is in Spotify and linked to this setlist.</p>
      <div className="row-btns">
        <a className="btn primary" href={webUrl(made)} target="_blank" rel="noreferrer"><Icon name="music" size={18} /> Open in Spotify</a>
        <button className="btn" onClick={() => { app.playSpotify(made, true); onClose(); }}>Play it here</button>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="sp-make">
      <p className="hint">One recording per tune, in set order. Change any of them, or skip a tune.</p>
      <ol className="sp-rows">
        {(rows ?? []).map(r => (
          <li key={r.id} className={r.skip ? "skipped" : ""}>
            <div className="sp-tune"><b>{r.title}</b> <span className="hint">Set {r.set}</span></div>
            {r.options === null ? <span className="hint">Finding a recording…</span>
              : r.saved ? (
                <div className="sp-pick">
                  <span className="sp-ver">{r.pick?.name} <span className="hint">{r.pick?.artists} · saved</span></span>
                  <button className="btn small" onClick={() => void change(r.id)}>Change</button>
                </div>
              ) : r.options.length ? (
                <select aria-label={"Recording of " + r.title} value={r.skip ? "" : r.pick?.uri ?? ""} onChange={e => pick(r.id, e.target.value)}>
                  {r.options.map(v => <option key={v.uri} value={v.uri}>{v.name} · {v.artists}</option>)}
                  <option value="">Skip this tune</option>
                </select>
              ) : <span className="hint">No recording found, so it&apos;s left out.</span>}
          </li>
        ))}
      </ol>
      <label className="field">
        <span className="field-label">Playlist name</span>
        <input maxLength={100} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="sp-check"><input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} /> Show it on my Spotify profile</label>
      {err && <p className="flag" role="alert">{err}</p>}
      <div className="row-btns">
        {linked && <button className="btn primary" id="sp-update" disabled={busy || pending || !uris.length} onClick={() => void create(linked)}>
          <Icon name="music" size={18} /> {busy ? "Updating…" : pending ? "Finding recordings…" : `Update playlist (${uris.length} tracks)`}
        </button>}
        {linked
          ? <button className="btn" id="sp-create" disabled={busy || pending || !uris.length} onClick={() => void create()}>Make a new one instead</button>
          : <button className="btn primary" id="sp-create" disabled={busy || pending || !uris.length} onClick={() => void create()}>
              <Icon name="music" size={18} /> {busy ? "Making it…" : pending ? "Finding recordings…" : `Create playlist (${uris.length} tracks)`}
            </button>}
      </div>
      <div><button className="btn small" onClick={() => void disconnectSpotify().then(() => setConnected(false))}>Disconnect Spotify</button></div>
    </div>
  );
}
