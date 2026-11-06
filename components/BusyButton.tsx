"use client";
// A button for something that fetches or saves: it can't be pressed twice, and says what it's doing while it runs.
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";

export function BusyButton({ onClick, busy: label = "Saving…", className = "btn", type = "button", disabled, children, ...rest }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { onClick: () => Promise<unknown> | unknown; busy?: string }) {
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return (
    <button {...rest} type={type} className={className} disabled={disabled || busy} aria-busy={busy || undefined} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { await onClick(); } finally { if (live.current) setBusy(false); }
    }}>{busy ? <><span className="spinner" aria-hidden="true" /> {label}</> : children}</button>
  );
}
