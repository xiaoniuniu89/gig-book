"use client";
// /ai: Niu AI. Describe a gig, get a setlist drafted from your library (R9.2), review it, save it.
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { AiDraft } from "../AiDraft";
import { Info } from "../Info";

export function NiuAiView() {
  const app = useApp();
  const { setCrumb, setCurrent } = app;
  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);
  return (
    <>
      <h1>Niu AI</h1>
      <section className="panel" aria-label="Draft a setlist" data-tour="ai">
        <h2>Draft a setlist <Info label="About drafting a setlist">Niu AI picks tunes from your library and says why. You can reorder, swap or remove any of them before saving.</Info></h2>
        {app.store.kind === "supabase"
          ? <AiDraft />
          : <p className="hint">Niu AI needs an account. Sign in from the <Link href="/">home page</Link> to use it.</p>}
      </section>
    </>
  );
}
