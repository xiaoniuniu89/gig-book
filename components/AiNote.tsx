"use client";
// The note before AI reads someone's own work (bio, press kit, lead sheets, transcriptions). Plenty of musicians would rather
// keep their work away from AI, so it says plainly where it goes. On by default; Settings → AI notes turns it off.
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";

/** `what`: what is shared ("your lead sheet"); `children`: anything else worth knowing (limits, mistakes). */
export function AiNote({ what, children }: { what: string; children?: ReactNode }) {
  const { settings } = useApp();
  if (settings.aiNotes === false) return null;
  return (
    <div className="callout warn" role="note"><Icon name="info" size={18} />
      <span>This shares {what} with an outside AI company (a third-party service) so it can read it. Rather not? Fill it in yourself instead.{children ? <> {children}</> : null}</span>
    </div>
  );
}
