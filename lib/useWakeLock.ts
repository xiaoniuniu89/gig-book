"use client";
// Keep the screen awake while a chart is open (on a gig nobody wants the phone or iPad to dim). A hidden tab loses the
// lock, so ask again when it comes back. Browsers without the Screen Wake Lock API (iOS before 16.4) just carry on.
import { useEffect } from "react";

export function useWakeLock(on = true) {
  useEffect(() => {
    if (!on) return;
    let lock: WakeLockSentinel | null = null, gone = false;
    const get = async () => {
      try {
        const l = await navigator.wakeLock?.request("screen");
        if (!l) return;
        if (gone) l.release().catch(() => {}); else lock = l;
      } catch { /* unsupported or refused */ }
    };
    const vis = () => { if (document.visibilityState === "visible") void get(); };
    void get();
    document.addEventListener("visibilitychange", vis);
    return () => { gone = true; document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [on]);
}
