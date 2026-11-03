"use client";
import { useApp } from "./AppProvider";

export function Toast() {
  const { toastMsg, settings } = useApp();
  if (settings.calm) return <div hidden />; // calm mode: confirmations show in the top bar (CalmStatus), nothing pops up
  return <div id="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>;
}

/** Calm mode's confirmations: a still line under the top bar, in place of a toast. */
export function CalmStatus() {
  const { toastMsg, settings } = useApp();
  if (!settings.calm) return null;
  return <div className="calm-status" role="status">{toastMsg}</div>;
}
