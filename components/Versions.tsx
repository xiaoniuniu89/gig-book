"use client";
// Chart versions (R3.5): tabs above the iReal chart. Original first, then the famous recorded reharmonisations the AI found
// (once per tune) and the versions players added. Picking one redraws the chart: the hook hands back a song with those chords,
// and everything that reads the chart (scales, guide tones, sixth diminished, the band) uses it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { songKey } from "@/lib/songs";
import { getSupabase } from "@/lib/supabase/client";
import { MAX_NAME, applyChanges, changesText, cleanName, parseChanges } from "@/lib/versions";
import type { Song } from "@/lib/ireal";
import type { TuneVersion, TuneVersions } from "@/lib/data/types";

const PICK_KEY = "gigbook-version-tab";
const NONE: TuneVersions = { versions: [], aiDone: true };
const msg = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

function readPicks(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PICK_KEY) || "{}") as Record<string, string>; } catch { return {}; }
}

/** The shared versions of a tune and the one picked (remembered on this device). `song` is the tune with the picked changes. */
export function useVersions(sg: Song | null) {
  const { store } = useApp();
  const key = sg ? songKey(sg.raw) : "";
  const on = store.kind === "supabase";
  const [data, setData] = useState<TuneVersions>(NONE);
  const [pick, setPickState] = useState("");
  useEffect(() => {
    setPickState(readPicks()[key] || "");
    if (!on || !key) { setData(NONE); return; }
    let gone = false;
    store.listTuneVersions(key).then(d => { if (!gone) setData(d); }, () => { if (!gone) setData(NONE); });
    return () => { gone = true; };
  }, [store, key, on]);
  const setPick = useCallback((id: string) => {
    setPickState(id);
    try { const m = readPicks(); if (!id) delete m[key]; else m[key] = id; localStorage.setItem(PICK_KEY, JSON.stringify(m)); } catch { /* private mode */ }
  }, [key]);
  const versions = useMemo(() => data.versions.filter(v => v.songKey === key), [data, key]);
  const shown = versions.find(v => v.id === pick) ?? null; // a remembered version that's gone falls back to Original
  const applied = useMemo(() => sg && shown ? applyChanges(sg, shown.changes) : null, [sg, shown]);
  return { on, key, versions, aiDone: data.aiDone, shown, fits: !shown || !!applied, song: applied ?? sg, pick: shown ? shown.id : "", setPick, setData };
}
export type Versions = ReturnType<typeof useVersions>;

/** Reports a version through the same path as the Bugs & ideas button. */
async function report(v: TuneVersion, page: string) {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") },
    body: JSON.stringify({ text: `[Other] Please look at the chart version "${v.name}" (id ${v.id}, ${v.source}, song ${v.songKey}).`, page }),
  });
  if (!res.ok) throw new Error("Couldn't send the report.");
}

function Editor({ sg, vs, edit, onClose }: { sg: Song; vs: Versions; edit: TuneVersion | null; onClose: () => void }) {
  const { store, toast } = useApp();
  const original = useMemo(() => changesText(sg), [sg]);
  const [from, setFrom] = useState(edit ? edit.id : vs.pick);
  const [name, setName] = useState(edit ? edit.name : "");
  const [text, setText] = useState(edit ? edit.changes : vs.shown ? vs.shown.changes : original);
  const [busy, setBusy] = useState(false);
  const check = parseChanges(text, sg.bars.length);
  const err = "error" in check ? check.error : "";
  const canName = !edit || edit.mine;
  const start = (id: string) => { setFrom(id); setText(id ? vs.versions.find(v => v.id === id)?.changes ?? original : original); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = cleanName(name);
    if (canName && !n) { toast("Name it: a player, a recording, or My changes."); return; }
    if (err) { toast(err); return; }
    setBusy(true);
    try {
      if (edit) {
        const next = await store.updateTuneVersion(edit, { name: canName ? n : edit.name, changes: text });
        vs.setData(d => ({ ...d, versions: d.versions.map(v => v.id === next.id ? next : v) }));
      } else {
        const next = await store.addTuneVersion(vs.key, n, text);
        vs.setData(d => ({ ...d, versions: d.versions.concat(next) }));
        vs.setPick(next.id);
      }
      onClose();
    } catch (er) { toast(msg(er, "Couldn't save that version.")); setBusy(false); }
  };
  return (
    <form className="chart-form" onSubmit={save}>
      {canName && <label className="field"><span className="field-label">Name</span>
        <input type="text" maxLength={MAX_NAME} value={name} onChange={e => setName(e.target.value)} placeholder="Player · Recording, or My changes" />
      </label>}
      {!edit && <label className="field"><span className="field-label">Start from</span>
        <select value={from} onChange={e => start(e.target.value)}>
          <option value="">Original</option>
          {vs.versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>}
      <label className="field"><span className="field-label">Changes</span>
        <textarea className="version-text" rows={Math.min(14, Math.max(5, Math.ceil(sg.bars.length / 4) + 1))} spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
        <span className="field-hint">One bar between each pair of | marks, like | Bbmaj7 | G7 | Cm7 F7 |. Two chords in a bar share it. Use % to repeat the bar before. {sg.bars.length} bars.</span>
      </label>
      {err && <p className="flag" role="alert">{err}</p>}
      <div className="row-btns">
        <button className="btn primary" type="submit" disabled={busy || !!err}>{busy ? "Saving…" : edit && !edit.mine && !edit.checked ? "Save and mark checked" : "Save"}</button>
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

/** The tab row and the picked version's details. Shown above the iReal chart, signed-in only. */
export function VersionBar({ sg, vs }: { sg: Song; vs: Versions }) {
  const { store, toast } = useApp();
  const page = usePathname();
  const [editor, setEditor] = useState<"add" | "edit" | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  useEffect(() => { setArmed(false); }, [vs.pick]);
  if (!vs.on) return null;
  const v = vs.shown;
  const replace = (n: TuneVersion) => vs.setData(d => ({ ...d, versions: d.versions.map(x => x.id === n.id ? n : x) }));

  const find = async () => {
    setFinding(true);
    try {
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
      const res = await fetch("/api/ai/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") },
        body: JSON.stringify({ raw: sg.raw }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok && res.status !== 409) throw new Error(j?.error || "Couldn't look those up (" + res.status + ").");
      const d = await store.listTuneVersions(vs.key);
      vs.setData(d);
      if (res.ok && !d.versions.some(x => x.source === "ai")) toast("No well-known recorded versions of this tune turned up.");
    } catch (e) { toast(msg(e, "Couldn't look those up.")); }
    setFinding(false);
  };
  const act = async (fn: () => Promise<void>, fail: string) => { setBusy(true); try { await fn(); } catch (e) { toast(msg(e, fail)); } setBusy(false); };
  const del = () => {
    if (!v) return;
    if (!armed) { setArmed(true); return; }
    void act(async () => { await store.deleteTuneVersion(v); vs.setData(d => ({ ...d, versions: d.versions.filter(x => x.id !== v.id) })); vs.setPick(""); }, "Couldn't delete that version.");
  };

  return (
    <div className="version-bar">
      <div className="chart-tabs-row">
        <div className="pl-tabs chart-tabs" role="tablist" aria-label="Versions">
          <button role="tab" className="pl-tab" aria-selected={!v} onClick={() => vs.setPick("")}>Original</button>
          {vs.versions.map(x => <button key={x.id} role="tab" className="pl-tab" aria-selected={vs.pick === x.id} onClick={() => vs.setPick(x.id)}>{x.name}</button>)}
        </div>
        <div className="row-btns">
          {!vs.aiDone && <button className="btn small accent" disabled={finding} onClick={find}><Icon name="sparkle" size={16} /> {finding ? "Looking…" : "Find famous versions"}</button>}
          <button className="btn small" onClick={() => setEditor("add")}><Icon name="plus" size={16} /> Add your own version</button>
        </div>
      </div>
      {v && (
        <div className="version-note">
          {v.source === "ai" && !v.checked && <span className="ver-tag">AI can make mistakes</span>}
          <span className="hint">
            {v.source === "ai"
              ? v.checked ? `Checked by ${v.checkedByName || "a member"}` : "Not checked yet"
              : `Added by ${v.authorName || "a member"}`}
          </span>
          {v.source === "ai" && <Info label="About AI versions">If you know the record, fix it and mark it checked. Saving a fix also marks it checked.</Info>}
          {!vs.fits && <span className="flag">This chart has a different number of bars, so this version can&apos;t be shown on it.</span>}
          <span className="version-acts">
            {v.source === "ai" && !v.checked && <button className="btn small" disabled={busy} onClick={() => act(async () => replace(await store.checkTuneVersion(v)), "Couldn't mark that checked.")}>Mark checked</button>}
            {(v.source === "ai" || v.mine) && <button className="btn small" disabled={busy} onClick={() => setEditor("edit")}><Icon name="edit" size={16} /> Edit</button>}
            <details className="version-menu">
              <summary className="btn small" aria-label="More">⋯</summary>
              <div className="version-menu-list">
                <button className="btn small" onClick={() => act(async () => { await report(v, page); toast("Thanks, we'll take a look."); }, "Couldn't send the report.")}>Report</button>
                {v.mine && <button className="btn small" onClick={del}><Icon name="trash" size={16} /> {armed ? "Tap again to delete" : "Delete"}</button>}
              </div>
            </details>
          </span>
        </div>
      )}
      <Modal open={editor !== null} title={editor === "edit" && v ? "Edit " + v.name : "Add your own version"} onClose={() => setEditor(null)}>
        {editor && <Editor sg={sg} vs={vs} edit={editor === "edit" ? v : null} onClose={() => setEditor(null)} />}
      </Modal>
    </div>
  );
}
