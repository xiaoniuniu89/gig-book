"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "./AppProvider";
import type { Collaborator } from "@/lib/data/types";

// One-tap choices: people you've been in a band or shared a setlist with, newest first, with a name filter.
// `exclude` hides people already in. Renders nothing in local mode or when there's no one.
export function Collaborators({ exclude, verb = "Add", onPick }: { exclude: string[]; verb?: string; onPick: (c: Collaborator) => Promise<void> | void }) {
  const { store, account } = useApp();
  const [all, setAll] = useState<Collaborator[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const on = store.kind === "supabase" && !!account;
  useEffect(() => {
    if (!on) return;
    let live = true;
    store.listCollaborators().then(r => { if (live) setAll(r); }).catch(() => {});
    return () => { live = false; };
  }, [store, on]);
  const left = all.filter(c => !exclude.includes(c.userId));
  if (!on || !left.length) return null;
  const shown = left.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="collabs" id="collaborators">
      <h3 className="modal-sub">Recent collaborators</h3>
      {left.length > 5 && <input type="search" aria-label="Filter by name" placeholder="Filter by name" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />}
      <div className="collab-list">
        {shown.map(c => (
          <button key={c.userId} type="button" className="btn small" disabled={busy !== null} onClick={async () => {
            setBusy(c.userId);
            try { await onPick(c); } finally { setBusy(null); }
          }}><Icon name="user" size={14} /> {verb} {c.name}</button>
        ))}
        {!shown.length && <p className="hint">No one by that name.</p>}
      </div>
    </div>
  );
}
