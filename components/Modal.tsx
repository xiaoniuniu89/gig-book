"use client";
// A native <dialog>: focus trap, Escape and the backdrop come from the browser.
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn icon-btn" aria-label="Close" title="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="modal-body">{open && children}</div>
    </dialog>
  );
}
