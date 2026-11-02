"use client";
// Pick what someone plays: chips from the shared list (lib/instruments.ts) plus a custom entry, or a compact dropdown.
import { useState } from "react";
import { INSTRUMENTS, canonInstrument } from "@/lib/instruments";

export function InstrumentPicker({ value, onChange, options, dropdown, label = "Instruments" }: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Only these (e.g. the ones on someone's profile); no custom entry. Default: the whole list plus custom entries. */
  options?: string[];
  /** A multi-select dropdown instead of chips. */
  dropdown?: boolean;
  label?: string;
}) {
  const [text, setText] = useState("");
  const list: string[] = options ?? [...INSTRUMENTS, ...value.filter(v => !(INSTRUMENTS as readonly string[]).includes(v))];
  const has = (i: string) => value.some(v => v.toLowerCase() === i.toLowerCase());
  const toggle = (i: string) => onChange(has(i) ? value.filter(v => v.toLowerCase() !== i.toLowerCase()) : [...value, i]);
  const addCustom = () => {
    const t = canonInstrument(text.slice(0, 40));
    setText("");
    if (t && !has(t)) onChange([...value, t]);
  };

  if (dropdown) {
    return (
      <details className="multi">
        <summary aria-label={label}>{value.length ? value.join(", ") : "Choose…"}</summary>
        <div className="multi-list">
          {list.map(i => (
            <label className="toggle" key={i}><input type="checkbox" checked={has(i)} onChange={() => toggle(i)} /> {i}</label>
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="pick" role="group" aria-label={label}>
      <div className="pick-chips">
        {list.map(i => <button key={i} type="button" className="chip" aria-pressed={has(i)} onClick={() => toggle(i)}>{i}</button>)}
      </div>
      {!options && (
        <div className="inline-form">
          <input type="text" aria-label="Another instrument" placeholder="Something else…" maxLength={40} value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <button className="btn small" type="button" disabled={!text.trim()} onClick={addCustom}>Add</button>
        </div>
      )}
    </div>
  );
}
