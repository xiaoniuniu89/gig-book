"use client";
// Import from iReal Pro: a shared HTML file or an irealb:// link. It goes straight into the library; making a setlist from it is an option.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { checkFile } from "@/lib/validate";
import { splitPlaylists, type Playlist } from "@/lib/ireal";
import { newItemId, slug, type Setlist } from "@/lib/data/types";

export function ImportPanel({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const router = useRouter();
  const { library } = app;
  const [found, setFound] = useState<Playlist[] | null>(null);
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);

  const handle = async (t: string) => {
    const lists = splitPlaylists(t);
    setFound(lists);
    if (!lists.length) return;
    setText("");
    try {
      for (const p of lists) {
        // Re-importing a playlist with the same name replaces it.
        const existing = library.find(x => x.name === p.name || x.id === slug(p.name));
        const id = existing ? existing.id : app.store.newId(p.name, id => library.some(x => x.id === id));
        await app.addLibraryPlaylist({ id, name: p.name, songs: p.songs });
      }
    } catch (e) { setFound(null); app.toast(e instanceof Error ? e.message : "Couldn't add that to your library."); }
  };
  const handleFile = (f: File) => {
    const why = checkFile(f, { maxMB: 5, types: /^(text\/|$)/, typeName: "an HTML or .txt file from iReal Pro", exts: /\.(html?|txt)$/i });
    if (why) app.toast(why); else void f.text().then(handle);
  };

  const makeSetlist = async (p: Playlist) => {
    const id = app.store.newId(p.name, id => !!app.setlistById(id));
    const half = Math.ceil(p.songs.length / 2);
    const s: Setlist = {
      id, name: p.name, spotify: null, visibility: "private", role: "owner",
      items: p.songs.map((raw, k) => ({ id: newItemId(), raw, set: p.songs.length > 6 && k >= half ? 2 : 1, shift: null, versions: [] })),
    };
    await app.addSetlist(s);
    onDone?.();
    router.push("/set/" + encodeURIComponent(id));
  };

  return (
    <div className={"import" + (over ? " over" : "")}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
      <p className="hint">In iReal Pro, share a playlist as HTML, then choose the file or drop it here. You can also paste an irealb:// link.</p>
      <div className="drop">
        <label className="btn primary" htmlFor="imp-file">Choose file</label>
        <input className="file-in" id="imp-file" type="file" accept=".html,.htm,.txt"
          onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) handleFile(f); }} />
      </div>
      <div className="new-set">
        <input aria-label="iReal Pro link" placeholder="irealb://…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void handle(text); }} />
        <button className="btn" onClick={() => void handle(text)} disabled={!text.trim()}>Read link</button>
      </div>
      {found && !found.length && <p className="flag">No iReal Pro playlist found in that. Share the playlist from iReal Pro as HTML and try again.</p>}
      {found && found.map((p, i) => (
        <div className="imp-row" key={i}>
          <div><b>{p.name}</b><span className="hint"> · {p.songs.length} tune{p.songs.length === 1 ? "" : "s"} added to your library</span></div>
          <div className="row-btns">
            <button className="btn" onClick={() => void makeSetlist(p)}>Make it a setlist too</button>
          </div>
        </div>
      ))}
      {found && found.length > 0 && onDone && <div className="row-btns"><button className="btn primary" onClick={onDone}>Done</button></div>}
    </div>
  );
}
