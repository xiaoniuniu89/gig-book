"use client";
// A song with a lead sheet and no chords: Niu AI reads the sheet, you check the chart, and it's saved on this setlist's
// copy of the tune. The song's owner can also save it on the song, so it's there outside this setlist.
import { useState } from "react";
import { useApp } from "./AppProvider";
import { AiNote } from "./AiNote";
import { ChartEditor, blankSection, fromEdit, toEdit, type EditSection } from "./ChartEditor";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { chartFromLeadSheet, type ChartGuess } from "@/lib/ai/leadsheetClient";
import { encodeChart } from "@/lib/irealExport";
import type { OriginalSong } from "@/lib/data/types";

/** `item`: the setlist copy to change; without it, the song itself (yours). `start`: a chart AI already made (Find a lead sheet); opens on it, with no button. */
export function MakeChart({ o, raw, item, start, onClose, onDone }: { o?: OriginalSong | null; raw: string; item?: { setlistId: string; itemId: string }; start?: ChartGuess; onClose?: () => void; onDone: (raw: string) => void }) {
  const { store, toast, putOriginal } = useApp();
  const [open, setOpen] = useState(!!start);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guess, setGuess] = useState<ChartGuess | null>(start ?? null);
  const [edit, setEdit] = useState<EditSection[] | null>(start ? toEdit(start.sections) : null);
  const [problems, setProblems] = useState<string[]>([]);
  const [onSong, setOnSong] = useState(true);
  const f = raw.split("=");
  const ts = edit?.[0]?.ts ?? "4/4";

  const read = async () => {
    if (!o) return;
    setReading(true); setProblems([]);
    try {
      const res = await fetch(await store.originalLeadSheetUrl(o));
      if (!res.ok) throw new Error("Couldn't open the lead sheet.");
      const g = await chartFromLeadSheet(new File([await res.blob()], o.leadSheet?.name || "lead sheet", { type: o.leadSheet?.mime }));
      setGuess(g);
      if (g.errors.length) { setProblems(["The AI's chart wasn't used, because:", ...g.errors]); setEdit([blankSection("A", "4/4")]); }
      else setEdit(toEdit(g.sections));
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't read the lead sheet."); }
    setReading(false);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit || saving) return;
    const r = fromEdit(edit);
    if (r.errors.length) { setProblems(r.errors); return; }
    setSaving(true); setProblems([]);
    try {
      const next = encodeChart({ title: f[0], composer: f[1], style: f[3], key: guess?.key || f[4], tempo: guess?.tempo || undefined, sections: r.sections });
      if (item) await store.setItemChart(item.setlistId, item.itemId, next);
      if (o?.mine && (!item || onSong)) putOriginal(await store.updateOriginal(o, { raw: next, visibility: o.visibility, bandId: o.bandId }));
      setOpen(false);
      onDone(next);
      onClose?.();
      toast("Chart saved.");
    } catch (er) { toast(er instanceof Error ? er.message : "Couldn't save the chart."); }
    setSaving(false);
  };

  return <>
    {!start && <button className="btn small" onClick={() => setOpen(true)}><Icon name="sparkle" size={16} /> Make the iReal chart</button>}
    <Modal open={open} title="Make the iReal chart" onClose={() => { if (!saving) { setOpen(false); onClose?.(); } }} dirty={!!edit}>
      <form className="chart-form" onSubmit={save}>
        {!edit ? <>
          <AiNote what="the lead sheet">It can make mistakes: check every bar before you save.</AiNote>
          <div className="row-btns">
            <button className="btn primary" type="button" disabled={reading} onClick={read}>{reading ? <><span className="spinner" aria-hidden="true" /> Reading the lead sheet…</> : <><Icon name="sparkle" size={18} /> Read the lead sheet</>}</button>
            <button className="btn" type="button" disabled={reading} onClick={() => setEdit([blankSection("A", "4/4")])}><Icon name="edit" size={18} /> Type it in</button>
          </div>
        </> : <>
          <ChartEditor value={edit} onChange={setEdit} ts={ts} />
          {item && o?.mine && <label className="toggle"><input type="checkbox" checked={onSong} onChange={e => setOnSong(e.target.checked)} /> Also save it on my song, for use outside this setlist</label>}
          <div className="row-btns"><button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save chart"}</button></div>
        </>}
        {problems.length > 0 && <ul className="field-err" role="alert">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </form>
    </Modal>
  </>;
}
