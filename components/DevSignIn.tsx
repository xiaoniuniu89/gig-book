"use client";
// Local development only (npm run dev): sign in as one of the fake musicians from `npm run seed:dev`. Never built into the live app.
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

// same people and password as tests/fixtures.ts (not imported: it pulls in the whole standards file)
const FAKES = [["ava", "Ava · piano, vocals"], ["ben", "Ben · bass"], ["cleo", "Cleo · drums"], ["dev", "Dev · tenor sax"], ["eli", "Eli · guitar"], ["fay", "Fay · trumpet"]];
const PASSWORD = "gigbook-fake-pw-1";

export default function DevSignIn() {
  const [err, setErr] = useState("");
  const go = async (key: string) => {
    const sb = getSupabase(); if (!sb) return;
    const { error } = await sb.auth.signInWithPassword({ email: key + "@gigbook.test", password: PASSWORD });
    setErr(error ? error.message + " (run npm run seed:dev?)" : "");
  };
  return (
    <div className="dev-signin">
      <h3 className="modal-sub">Sign in as a test musician</h3>
      <div className="row-btns">{FAKES.map(([k, label]) => <button key={k} className="btn small" onClick={() => void go(k)}>{label}</button>)}</div>
      {err && <p className="flag" role="alert">{err}</p>}
    </div>
  );
}
