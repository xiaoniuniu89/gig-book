"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "./AppProvider";
import type { Person } from "@/lib/data/types";

/** What the box holds: someone picked from the list, or a typed email (the fallback for people you haven't played with). */
export type Picked = { kind: "person"; person: Person } | { kind: "email"; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Type 2+ letters of a name, pick from the list (people you play with only). A full email also works.
// Controlled: `value` is null until someone is picked or an email is typed. `exclude` hides people already in.
export function PeoplePicker({ value, onChange, exclude = [], label = "Add a person", placeholder = "Type a name or an email", disabled }: {
  value: Picked | null; onChange: (v: Picked | null) => void; exclude?: string[]; label?: string; placeholder?: string; disabled?: boolean;
}) {
  const { store } = useApp();
  const id = useId();
  const [text, setText] = useState(value?.kind === "email" ? value.email : "");
  const [list, setList] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(0);
  const [asked, setAsked] = useState("");
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  // The parent cleared us (after an add): forget what was typed.
  useEffect(() => { if (!value) { setText(t => (EMAIL.test(t.trim()) ? "" : t)); } }, [value]);

  const q = text.trim();
  useEffect(() => {
    if (value?.kind === "person" || q.length < 2 || EMAIL.test(q)) { setList([]); setAsked(""); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      store.searchPeople(q).then(r => { if (n === seq.current) { setList(r); setAsked(q); } }).catch(() => { if (n === seq.current) { setList([]); setAsked(q); } });
    }, 200);
    return () => clearTimeout(t);
  }, [q, store, value]);

  const shown = list.filter(p => !exclude.includes(p.userId));
  const showList = open && !value && q.length >= 2 && !EMAIL.test(q);
  const pick = (p: Person) => { onChange({ kind: "person", person: p }); setText(""); setOpen(false); setHot(0); };
  const type = (v: string) => {
    setText(v); setOpen(true); setHot(0);
    onChange(EMAIL.test(v.trim()) ? { kind: "email", email: v.trim() } : null);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && shown.length) { e.preventDefault(); setOpen(true); setHot(h => (h + 1) % shown.length); }
    else if (e.key === "ArrowUp" && shown.length) { e.preventDefault(); setHot(h => (h + shown.length - 1) % shown.length); }
    else if (e.key === "Enter" && showList && shown[hot]) { e.preventDefault(); pick(shown[hot]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "Backspace" && !text && value?.kind === "person") { onChange(null); }
  };

  return (
    <div className="people-picker">
      {value?.kind === "person" ? (
        <span className="people-chip">
          <span className="avatar" aria-hidden="true">{value.person.name.charAt(0).toUpperCase()}</span>
          {value.person.name}
          <button type="button" aria-label={"Remove " + value.person.name} disabled={disabled} onClick={() => { onChange(null); input.current?.focus(); }}>✕</button>
        </span>
      ) : (
        <>
          <input ref={input} type="text" role="combobox" aria-label={label} aria-expanded={showList} aria-controls={id + "-list"} aria-autocomplete="list"
            aria-activedescendant={showList && shown[hot] ? id + "-" + shown[hot].userId : undefined}
            placeholder={placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={disabled} value={text}
            onChange={e => type(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={key} />
          {showList && (
            <ul className="people-list" id={id + "-list"} role="listbox" aria-label="People you play with">
              {shown.map((p, i) => (
                <li key={p.userId} id={id + "-" + p.userId} role="option" aria-selected={i === hot} className={i === hot ? "on" : ""}
                  onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHot(i)}>
                  <span className="avatar" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                  <span className="name">{p.name}{p.instruments.length > 0 && <span className="sub">{p.instruments.join(", ")}</span>}</span>
                </li>
              ))}
              {!shown.length && asked === q && <li className="none" role="presentation">No one you play with by that name. Type their full email instead.</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
