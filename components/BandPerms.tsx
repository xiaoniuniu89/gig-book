"use client";
// The four band permission switches (R10): used for a band's defaults and for one person's settings.
import { BAND_PERMS, type BandPerms } from "@/lib/data/types";

export function PermSwitches({ value, onChange, disabled }: { value: BandPerms; onChange: (v: BandPerms) => void; disabled?: boolean }) {
  return (
    <div className="perms">
      {BAND_PERMS.map(p => (
        <label className="toggle" key={p.key}>
          <input type="checkbox" checked={value[p.key]} disabled={disabled} onChange={e => onChange({ ...value, [p.key]: e.target.checked })} /> {p.label}
        </label>
      ))}
    </div>
  );
}
