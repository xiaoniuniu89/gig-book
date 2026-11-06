// What ships with the app and is never stored: example setlists and the Jazz Essentials library.
import billie from "@/data/setlists/billie-holiday-short-setlist.json";
import swing from "@/data/setlists/medium-swing.json";
import ballads from "@/data/setlists/ballads.json";
import standards from "@/data/library/essential-standards.json";
import type { LibraryPlaylist, Setlist } from "./data/types";

/** Example setlists everyone sees. Read-only ("viewer"); Make a copy turns one into your own. */
export const BUILTIN_SETLISTS: Setlist[] = [
  { ...(billie as unknown as Setlist), id: "builtin-billie-holiday" },
  swing as unknown as Setlist,
  ballads as unknown as Setlist,
].map(s => ({ ...s, role: "viewer", visibility: "private" }));

export const isBuiltin = (id: string) => id.startsWith("builtin-");

/** Ids the old app seeded into local storage; never copied into an account. */
export const LEGACY_SEED_IDS = ["billie-holiday-short-setlist"];

/** Your setlists, then the examples, minus any example you already have a copy of by name (an old seeded copy wins). */
export const withBuiltins = (own: Setlist[]): Setlist[] =>
  own.concat(BUILTIN_SETLISTS.filter(b => !own.some(s => s.name === b.name)));

/** Built into every library and never stored: core jazz standards, charts from the iReal Pro forum's Jazz 1460 playlist. */
/** The library playlist made from your original songs (R16); it is never stored as a playlist. */
export const ORIGINALS_ID = "originals";
export const BUILTIN_LIBRARY: LibraryPlaylist = { id: "jazz-essentials", name: "Jazz Essentials", songs: standards as string[] };
