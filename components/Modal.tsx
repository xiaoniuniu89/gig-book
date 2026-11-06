"use client";
// A native <dialog>: focus trap, Escape and the backdrop come from the browser.
// `dirty` = unsaved changes: closing (✕, backdrop, Escape) asks first.
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({ open, title, onClose, dirty, children }: { open: boolean; title: string; onClose: () => void; dirty?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  const tryClose = () => { if (!dirty || confirm("Close without saving? Your changes will be lost.")) onClose(); };
  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose}
      onCancel={e => { if (dirty) { e.preventDefault(); tryClose(); } }}
      onClick={e => { if (e.target === e.currentTarget) tryClose(); }}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn icon-btn" aria-label="Close" title="Close" onClick={tryClose}><Icon name="close" /></button>
      </div>
      <div className="modal-body">{open && children}</div>
    </dialog>
  );
}
