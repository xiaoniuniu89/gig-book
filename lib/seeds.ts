// Setlists loaded on first run.
import seedIds from "@/data/seeds.json";
import billie from "@/data/setlists/billie-holiday-short-setlist.json";
import type { Setlist } from "./data/types";

const ALL: Record<string, unknown> = { "billie-holiday-short-setlist": billie };

export const SEEDS: Setlist[] = (seedIds as string[]).map(id => ALL[id] as Setlist).filter(Boolean);

/** A deep copy, so editing a seeded setlist never touches the imported module object. */
export const cloneSeed = (s: Setlist): Setlist => JSON.parse(JSON.stringify(s));
