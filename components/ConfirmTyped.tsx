"use client";
// For things that can't be undone (leave a band, delete a setlist…): type "approve" to confirm. The copy button is
// there so nobody has to fight a phone keyboard over one word.
import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { useApp } from "./AppProvider";

const WORD = "approve";

export function ConfirmTyped({ open, title, action, children, onClose, onConfirm }: {
  open: boolean; title: string; action: string; children?: ReactNode; onClose: () => void; onConfirm: () => Promise<void> | void;
}) {
  const { toast } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = text.trim().toLowerCase() === WORD;
  const close = () => { setText(""); onClose(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(WORD); toast("Copied."); } catch { /* they can type it */ }
  };
  return (
    <Modal open={open} title={title} onClose={close}>
      <form className="chart-form" onSubmit={async e => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        try { await onConfirm(); setText(""); } finally { setBusy(false); }
      }}>
        {children && <div className="hint">{children}</div>}
        <label className="field"><span className="field-label">Type <b>{WORD}</b> to confirm
          <button type="button" className="btn icon-btn small" aria-label={"Copy " + WORD} title="Copy" onClick={() => void copy()}><Icon name="copy" size={16} /></button></span>
          <input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={!ok || busy}>{action}</button>
          <button className="btn" type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
