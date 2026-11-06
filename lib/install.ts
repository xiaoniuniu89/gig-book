"use client";
// Installing the site as an app. Chrome, Edge and Android offer a prompt we can trigger from a button; we keep the
// event when it fires. iPhone and iPad (Safari) have no prompt: people use Share > Add to Home Screen.
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let saved: Prompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); saved = e as Prompt; listeners.forEach(f => f()); });
  window.addEventListener("appinstalled", () => { saved = null; listeners.forEach(f => f()); });
}

export type InstallState = "installed" | "prompt" | "ios" | "other";
export function installState(): InstallState {
  if (typeof window === "undefined") return "other";
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "installed";
  if (saved) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}
export const onInstallChange = (f: () => void): (() => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Shows the browser's install prompt. True when they installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!saved) return false;
  const p = saved; saved = null;
  await p.prompt();
  const { outcome } = await p.userChoice;
  listeners.forEach(f => f());
  return outcome === "accepted";
}
