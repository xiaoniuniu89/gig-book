// Turning songs into a YouTube play list. A saved `youtube:<id>` version wins; otherwise the song's automatic pick is used at play time.
import { songKey } from "../songs";
import type { Song } from "../ireal";
import type { Version } from "../data/types";
import { isYtUri, ytId } from "./ids";

export interface TuneRef { key: string; title: string; composer: string; id: string | null; setId?: string; idx?: number }

/** The first saved version for a player (`youtube:` or `spotify:`), or undefined. */
export const savedFor = (versions: Version[] | undefined, player: "youtube" | "spotify"): Version | undefined =>
  (versions || []).find(v => (player === "youtube") === isYtUri(v.uri));

export function tuneQueueItem(sg: Song, versions: Version[] | undefined, ref?: { setId: string; idx: number }): TuneRef {
  const v = savedFor(versions, "youtube");
  return { key: songKey(sg.raw), title: sg.title, composer: sg.composer, id: v ? ytId(v.uri) : null, ...ref };
}
