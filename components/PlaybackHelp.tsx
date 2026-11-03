"use client";
// "What works where": what the in-app Spotify player does on each device, with the visitor's row highlighted.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { PLAYBACK_ROWS, playbackSupport, type PlaybackRow } from "@/lib/playback";

// Looks at the device after mount, so the server render and first paint match (null until then).
export function useMyPlayback(): PlaybackRow | null {
  const [row, setRow] = useState<PlaybackRow | null>(null);
  useEffect(() => {
    const n = navigator as Navigator & { brave?: unknown };
    setRow(playbackSupport(n.userAgent, { brave: !!n.brave, touchMac: n.maxTouchPoints > 1 }));
  }, []);
  return row;
}

export function PlaybackHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mine = useMyPlayback();
  return (
    <Modal open={open} title="What works where" onClose={onClose}>
      <p className="hint">YouTube plays whole songs everywhere. Spotify&apos;s player here plays whole tracks only on some devices; Open in Spotify always works with a free Spotify account.</p>
      <ul className="pb-list">
        <li className="pb-row" data-level="full">
          <b>YouTube, on any device</b>
          <span>Whole songs, no account needed. May show ads.</span>
          <span className="hint">Have YouTube Premium? Sign in to YouTube in this browser for fewer or no ads. Doesn&apos;t work in every browser.</span>
        </li>
      </ul>
      <h3 className="modal-sub">Spotify</h3>
      {mine && <p><b>You&apos;re on {mine.you}.</b> {mine.tip}</p>}
      <ul className="pb-list">
        {PLAYBACK_ROWS.map(r => (
          <li key={r.id} className="pb-row" data-level={r.level} aria-current={mine?.id === r.id ? "true" : undefined}>
            <b>{r.label}{mine?.id === r.id ? " (you)" : ""}</b>
            <span>{r.result}</span>
            <span className="hint">{r.tip}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// The "What works where" button + its dialog.
export function PlaybackHelpLink({ className = "btn small link-btn" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="info" size={16} /> What works where</button>
      <PlaybackHelp open={open} onClose={() => setOpen(false)} />
    </>
  );
}
