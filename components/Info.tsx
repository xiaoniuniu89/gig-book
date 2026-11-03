"use client";
// A small (i) button that shows a short explanation on tap or click, instead of a line of text on screen.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Info({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button type="button" className="info-btn" aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <Icon name="info" size={18} />
      </button>
      {open && <span className="info-pop" id={id} role="note">{children}</span>}
    </span>
  );
}
