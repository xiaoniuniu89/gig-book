"use client";
// Share one of your library playlists: Who can see it, and a link. Others open the link and can add their own copy.
import { useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import type { LibraryPlaylist, Visibility } from "@/lib/data/types";

export function ShareLibrary({ pl }: { pl: LibraryPlaylist }) {
  const { store, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [vis, setVis] = useState<Visibility>("private");
  const [saving, setSaving] = useState(false);
  const show = async () => {
    setOpen(true);
    try { setVis((await store.getSharedPlaylist(pl.id))?.visibility ?? "private"); } catch { /* shows Private */ }
  };
  const pick = async (v: Visibility) => {
    const was = vis;
    setVis(v); setSaving(true);
    try { await store.setLibraryVisibility(pl.id, v); }
    catch (e) { setVis(was); toast(e instanceof Error ? e.message : "Couldn't change that."); }
    setSaving(false);
  };
  const link = () => `${location.origin}/shared/playlist/${encodeURIComponent(pl.id)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link()); toast("Link copied."); }
    catch { toast("Couldn't copy the link."); }
  };
  return <>
    <button className="btn" onClick={() => void show()}><Icon name="share" size={18} /> Share</button>
    <Modal open={open} title={"Share " + pl.name} onClose={() => setOpen(false)}>
      <div className="chart-form">
        <label className="field"><span className="field-label">Who can see it <Info label="About who can see it">Private: only you. Bands I&apos;m in: everyone in your bands who has the link. Public: anyone signed in to Niu Real Book who has the link. They can add their own copy to their library; your playlist stays yours.</Info></span>
          <select aria-label="Who can see it" disabled={saving} value={vis} onChange={e => void pick(e.target.value as Visibility)}>
            <option value="private">Private</option>
            <option value="bands">Bands I&apos;m in</option>
            <option value="public">Public</option>
          </select>
        </label>
        {vis !== "private" && <div className="row-btns"><button className="btn primary" type="button" disabled={saving} onClick={() => void copy()}>{saving ? "Saving…" : <><Icon name="copy" size={18} /> Copy link</>}</button></div>}
      </div>
    </Modal>
  </>;
}
