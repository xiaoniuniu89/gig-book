"use client";
// /tools: the practice tools. Each one lives on its own page and works offline.
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "../AppProvider";

const TOOLS = [
  { href: "/tools/transcribe", name: "Transcribe", wip: true, about: "Slow down and loop a YouTube video or your own recording, to learn it by ear" },
  { href: "/tools/metronome", name: "Metronome", about: "Tempo 30–300, tap tempo, accents, swing and a count-in" },
  { href: "/tools/drone", name: "Drone", about: "A held root, and a fifth if you like, in any key" },
  { href: "/tools/print", name: "Print sheet music", about: "A tune, a lick, a whole setlist, or blank manuscript paper" },
];

export function ToolsView() {
  const { setCrumb, setCurrent } = useApp();
  useEffect(() => { setCrumb("Tools"); setCurrent(null); }, [setCrumb, setCurrent]);
  return (
    <>
      <h1>Tools</h1>
      <div className="shelf" data-tour="tools">
        {TOOLS.map(t => (
          <Link key={t.href} className="book tool orange" href={t.href}>
            <span className="t">{t.name}</span>
            {"wip" in t && t.wip && <span className="tag">Work in progress</span>}
            <span className="m">{t.about}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Sets the crumb and clears the current tune for a page under /tools. */
export function useToolPage(name: string) {
  const { setCrumb, setCurrent } = useApp();
  useEffect(() => {
    setCrumb(<><Link href="/tools">Tools</Link> / {name}</>);
    setCurrent(null);
  }, [setCrumb, setCurrent, name]);
}
