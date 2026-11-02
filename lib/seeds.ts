// Setlists loaded on first run.
import seedIds from "@/data/seeds.json";
import billie from "@/data/setlists/billie-holiday-short-setlist.json";
import standards from "@/data/library/essential-standards.json";
import type { LibraryPlaylist, Setlist } from "./data/types";

const ALL: Record<string, unknown> = { "billie-holiday-short-setlist": billie };

export const SEEDS: Setlist[] = (seedIds as string[]).map(id => ALL[id] as Setlist).filter(Boolean);

/** A deep copy, so editing a seeded setlist never touches the imported module object. */
export const cloneSeed = (s: Setlist): Setlist => JSON.parse(JSON.stringify(s));

/** Library playlist added on first run: core jazz standards, charts from the iReal Pro forum's Jazz 1460 playlist. */
export const STARTER_LIBRARY: LibraryPlaylist = { id: "essential-standards", name: "Essential Standards", songs: standards as string[] };
