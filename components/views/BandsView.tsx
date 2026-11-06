"use client";
// /bands: the bands you're in, and New band (R10). Accounts only.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { Modal } from "../Modal";
import { PermSwitches } from "../BandPerms";
import { useApp } from "../AppProvider";
import { DEFAULT_BAND_PERMS, type Band } from "@/lib/data/types";

export function BandsView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const [bands, setBands] = useState<Band[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState(DEFAULT_BAND_PERMS);
  const [busy, setBusy] = useState(false);
  const signedIn = store.kind === "supabase";

  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || !signedIn) return;
    let gone = false;
    store.listBands().then(l => { if (!gone) setBands(l); }, e => { if (!gone) { setBands([]); toast(e instanceof Error ? e.message : "Couldn't load your bands."); } });
    return () => { gone = true; };
  }, [ready, signedIn, store, toast]);

  const create = async () => {
    if (busy) return;
    const n = name.trim().slice(0, 200);
    if (!n) { toast("Give the band a name."); return; }
    setBusy(true);
    try {
      const b = await store.createBand(n, perms);
      setAdding(false); setName(""); setPerms(DEFAULT_BAND_PERMS);
      router.push("/bands/" + b.id);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't create the band."); }
    setBusy(false);
  };

  if (!signedIn) return <><div className="page-head"><h1>Bands</h1></div><p className="hint">Sign in to set up a band.</p></>;
  return (
    <>
      <div className="page-head" data-tour="bands">
        <h1>Bands</h1>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> New band</button>
      </div>
      {bands === null ? <p className="hint" role="status">Loading…</p> : (
        <div className="shelf">
          {bands.map(b => (
            <Link key={b.id} className="book yellow" href={"/bands/" + b.id}>
              <span className="m">{b.role === "admin" ? "Admin" : "Member"}</span>
              <span className="t">{b.name}</span>
            </Link>
          ))}
          {!bands.length && <p className="hint">No bands yet. Make one with New band, or open an invite link from a bandmate.</p>}
        </div>
      )}
      <Modal open={adding} title="New band" onClose={() => setAdding(false)} dirty={!!name.trim() && !busy}>
        <form className="new-band" onSubmit={e => { e.preventDefault(); void create(); }}>
          <label className="field">
            <span className="field-label">Band name <span className="req" aria-hidden="true">*</span></span>
            <input aria-label="Band name" autoFocus required maxLength={200} placeholder="e.g. Ava Trio" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <h3 className="modal-sub">What new members can do <Info label="About member permissions">You&apos;re the admin and can do everything. You can change these later, or set them for one person.</Info></h3>
          <PermSwitches value={perms} onChange={setPerms} />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create band"}</button>
        </form>
      </Modal>
    </>
  );
}
