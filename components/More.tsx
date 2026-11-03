"use client";
// Calm mode: the actions inside go under a "More" button. Calm mode off: they stay on screen, as they always were.
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";

export function More({ children, label = "More" }: { children: React.ReactNode; label?: string }) {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!settings.calm) return <>{children}</>;
  return (
    <span className="more" ref={wrap}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {open && <div className="more-panel">{children}</div>}
    </span>
  );
}
