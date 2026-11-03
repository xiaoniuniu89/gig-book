"use client";
// /ai: Niu AI. Describe a gig, get a setlist drafted from your library (R9.2), review it, save it.
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { AiDraft } from "../AiDraft";

export function NiuAiView() {
  const app = useApp();
  const { setCrumb, setCurrent } = app;
  useEffect(() => { setCrumb("Niu AI"); setCurrent(null); }, [setCrumb, setCurrent]);
  return (
    <>
      <h1>Niu AI</h1>
      <section className="panel" aria-label="Draft a setlist">
        <h2>Draft a setlist</h2>
        <p className="hint">Describe the gig: the style, the tempo, how many tunes. Niu AI picks tunes from your library and says why. Reorder, swap or remove any of them, then save it as a setlist.</p>
        {app.store.kind === "supabase"
          ? <AiDraft />
          : <p className="hint">Niu AI needs an account. Sign in from the <Link href="/">home page</Link> to use it.</p>}
      </section>
    </>
  );
}
