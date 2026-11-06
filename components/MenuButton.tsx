"use client";
// A button that opens a short list of choices (always a dropdown, unlike More, which only folds in calm mode).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export function MenuButton({ label, className = "btn", items }: {
  label: ReactNode; className?: string; items: { label: ReactNode; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="more" ref={wrap}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {open && <div className="more-panel" role="menu">
        {items.map((it, i) => <button key={i} type="button" role="menuitem" className="btn" onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
      </div>}
    </span>
  );
}

/** How something new is uploaded (a transcription, a song): everything typed in by hand, or AI reads the file first. */
export type UploadMode = "manual" | "ai";

/** "Upload ▾": with AI, or manually. */
export function UploadMenu({ label, className, onPick }: { label: string; className?: string; onPick: (m: UploadMode) => void }) {
  return <MenuButton className={className} label={<><Icon name="upload" size={18} /> {label}</>} items={[
    { label: <><Icon name="sparkle" size={18} /> With AI</>, onClick: () => onPick("ai") },
    { label: <><Icon name="edit" size={18} /> Manually</>, onClick: () => onPick("manual") },
  ]} />;
}
