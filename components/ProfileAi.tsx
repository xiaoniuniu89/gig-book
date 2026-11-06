"use client";
// "Import from a press kit" (R11.8, #52): paste or upload (PDF, .docx, .txt), see what the AI read, tick what to keep, Apply.
import { useRef, useState } from "react";
import { AiNote } from "./AiNote";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { CONTACT_FIELDS, type Profile } from "@/lib/data/types";
import { canonInstruments } from "@/lib/instruments";
import { checkFile } from "@/lib/validate";
import { bioToHtml, bioToText } from "@/lib/richtext";
import { readSource, requestProfile, type ProfileSource, type ProfileSuggestion } from "@/lib/ai/profileClient";

const LENGTHS = [["50", "About 50 words"], ["100", "About 100 words"], ["250", "About 250 words"], ["long", "Long version"]] as const;

function Review({ p, s, busy, onApply, onBack }: { p: Profile; s: ProfileSuggestion; busy: boolean; onApply: (next: Profile) => void; onBack: () => void }) {
  const lens = LENGTHS.filter(([k]) => s.bios[k]);
  const [len, setLen] = useState<string>(s.bios["100"] ? "100" : lens[0]?.[0] || "");
  const rows: { key: string; label: string; old: string; neu: string }[] = [];
  if (s.name) rows.push({ key: "name", label: "Name", old: p.displayName, neu: s.name });
  if (s.instruments.length) rows.push({ key: "instruments", label: "Instruments", old: p.instruments.join(", "), neu: s.instruments.join(", ") });
  if (lens.length) rows.push({ key: "bio", label: "Bio", old: bioToText(p.bio), neu: s.bios[len] || "" });
  for (const f of CONTACT_FIELDS) if (s.contact[f.key]) rows.push({ key: f.key, label: f.label, old: p.contact[f.key] || "", neu: s.contact[f.key] });
  // empty now = ticked; has a value = unticked
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map(r => [r.key, !r.old.trim()])));
  const n = rows.filter(r => on[r.key]).length;
  const apply = () => {
    const next: Profile = { ...p, contact: { ...p.contact } };
    if (on.name) next.displayName = s.name;
    if (on.instruments) next.instruments = canonInstruments(s.instruments);
    if (on.bio) next.bio = bioToHtml(s.bios[len]);
    for (const f of CONTACT_FIELDS) if (on[f.key]) next.contact[f.key] = s.contact[f.key];
    onApply(next);
  };
  return <>
    <p className="hint">Here&apos;s what the AI found. Tick what you want to keep. Nothing changes until you press Apply.</p>
    <div className="pf-rows">
      {rows.map(r => (
        <label key={r.key} className="pf-row">
          <input type="checkbox" checked={!!on[r.key]} onChange={e => setOn(o => ({ ...o, [r.key]: e.target.checked }))} />
          <span className="pf-label">{r.label}</span>
          <span className="pf-body">
            {r.key === "bio" && lens.length > 1 && (
              <select aria-label="Bio length" value={len} onChange={e => setLen(e.target.value)}>
                {lens.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </select>
            )}
            <span className={r.key === "bio" ? "pf-bio" : ""}>{r.neu}</span>
            <span className="pf-old">{r.old.trim() ? "Now: " + (r.key === "bio" ? r.old.slice(0, 160) + (r.old.length > 160 ? "…" : "") : r.old) : "Now: not set"}</span>
          </span>
        </label>
      ))}
    </div>
    <div className="row-btns">
      <button className="btn primary" type="button" disabled={busy || !n} onClick={apply}>{busy ? "Saving…" : n ? `Apply ${n} ${n === 1 ? "change" : "changes"}` : "Apply"}</button>
      <button className="btn" type="button" disabled={busy} onClick={onBack}>Back</button>
    </div>
  </>;
}

export function ProfileAi({ p, busy, guard, onApply, label = "Import from a press kit", onKeep }: {
  p: Profile; busy: boolean; guard: (go: () => void) => void; onApply: (next: Profile) => Promise<boolean>;
  label?: string;
  /** Called with an uploaded PDF once its details are applied, to keep it as the press kit PDF. */
  onKeep?: (f: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");
  const [sug, setSug] = useState<ProfileSuggestion | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const close = () => { setOpen(false); setSug(null); setText(""); setFile(null); setErr(""); };
  const go = async () => {
    setWorking(true); setErr("");
    try {
      const src: ProfileSource = file ? await readSource(file) : { text: text.trim() };
      setSug(await requestProfile(src));
    } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); }
    setWorking(false);
  };
  return <>
    <div className="row-btns">
      <button className="btn small" type="button" onClick={() => guard(() => setOpen(true))}><Icon name="upload" size={16} /> {label}</button>
      <Info label="About uploading a press kit">Already have a press kit or CV? Upload it (or paste the text) and AI fills in your bio, instruments and links for you to check. A PDF is also kept as your press kit PDF. Your sharing settings don&apos;t change, and it counts toward your daily Niu AI requests.</Info>
    </div>
    <Modal open={open} title="Upload your press kit" onClose={close} dirty={(!!text.trim() || !!file) && !sug && !working}>
      <AiNote what="your text or file">Remove anything you don&apos;t want shared before you continue.</AiNote>
      {sug ? <Review p={p} s={sug} busy={busy} onBack={() => setSug(null)}
        onApply={async next => {
          if (!(await onApply(next))) return;
          if (file && onKeep && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) onKeep(file);
          close();
        }} /> : <div className="pf-ai">
        <textarea aria-label="Your press kit text" rows={8} placeholder="Paste your bio, one-sheet or CV text here" value={text} disabled={!!file || working} maxLength={60000} onChange={e => setText(e.target.value)} />
        <div className="row-btns">
          <input ref={pick} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={e => {
            const f = e.target.files?.[0] || null; e.target.value = "";
            const why = f && checkFile(f, { maxMB: 2 });
            if (why) { setErr(why); return; }
            setFile(f); setErr("");
          }} />
          <button className="btn small" type="button" disabled={working} onClick={() => pick.current?.click()}><Icon name="import" size={16} /> Upload a PDF, Word or .txt file</button>
          {file && <span className="hint">{file.name} <button className="btn small link-btn" type="button" disabled={working} onClick={() => setFile(null)}>Remove</button></span>}
          <span className="hint">Up to 2 MB</span>
        </div>
        {err && <p className="field-err" role="alert">{err}</p>}
        <div className="row-btns">
          <button className="btn primary" type="button" disabled={working || (!file && !text.trim())} onClick={() => void go()}>{working ? "Reading…" : "Read it"}</button>
          <button className="btn" type="button" disabled={working} onClick={close}>Cancel</button>
        </div>
      </div>}
    </Modal>
  </>;
}
