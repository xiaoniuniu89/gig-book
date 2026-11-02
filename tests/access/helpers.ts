import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import { ANON_KEY, SERVICE_KEY, SB_URL } from "../env";
import { USERS, type Who } from "../fixtures";
import { supabaseStore } from "@/lib/data/supabase";
import type { DataStore } from "@/lib/data/types";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export interface Musician { key: Who; id: string; sb: SupabaseClient; store: DataStore }

/** A real supabase-js client signed in as one fake musician, plus the real adapter on top of it. */
export async function as(who: Who): Promise<Musician> {
  const sb = createClient(SB_URL, ANON_KEY, opts);
  const { error } = await sb.auth.setSession(inject("sessions")[who]);
  if (error) throw error;
  return { key: who, id: USERS[who].id, sb, store: supabaseStore(sb, USERS[who].id) };
}

/** Signed out. */
export const anon = () => createClient(SB_URL, ANON_KEY, opts);
/** Service role: set up scratch rows and look at the truth. Never used for the assertions themselves. */
export const admin = () => createClient(SB_URL, SERVICE_KEY, opts);

export async function everyone(): Promise<Record<Who, Musician>> {
  const [ava, ben, cleo, dev, eli, fay] = await Promise.all((["ava", "ben", "cleo", "dev", "eli", "fay"] as Who[]).map(as));
  return { ava, ben, cleo, dev, eli, fay };
}

export function must<T>(r: { data: T; error: { message: string } | null }, what = "query"): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

const made = { bands: [] as string[], setlists: [] as string[] };

/** Deletes every scratch band and setlist this file made (the fake musicians must end up where the seed put them). */
export async function cleanScratch(): Promise<void> {
  const a = admin();
  if (made.setlists.length) await a.from("setlists").delete().in("id", made.setlists);
  if (made.bands.length) await a.from("bands").delete().in("id", made.bands);
  made.bands = []; made.setlists = [];
}

/** A scratch setlist made with the service role, so mutating tests never disturb the seeded rows. */
export async function scratchSetlist(o: { owner: Who; band?: string; members?: Partial<Record<Who, "viewer" | "editor">> }): Promise<string> {
  const a = admin();
  const id = crypto.randomUUID();
  made.setlists.push(id);
  must(await a.from("setlists").insert({ id, owner: USERS[o.owner].id, name: "Scratch", band_id: o.band ?? null }), "scratch setlist");
  must(await a.from("setlist_items").insert([{ setlist_id: id, position: 0, song: "Scratch A=X==Medium Swing=C==" }]), "scratch items");
  for (const [w, role] of Object.entries(o.members ?? {})) {
    must(await a.from("setlist_members").insert({ setlist_id: id, user_id: USERS[w as Who].id, role }), "scratch member");
  }
  return id;
}

/** A scratch band: `admins` and `members` are fake musicians. */
export async function scratchBand(admins: Who[], members: Who[] = [], defaultPerms?: object): Promise<string> {
  const a = admin();
  const id = crypto.randomUUID();
  made.bands.push(id);
  must(await a.from("bands").insert({ id, name: "Scratch Band", created_by: USERS[admins[0]].id, ...(defaultPerms ? { default_perms: defaultPerms } : {}) }), "scratch band");
  must(await a.from("band_members").insert([
    ...admins.map(w => ({ band_id: id, user_id: USERS[w].id, role: "admin", share: {} })),
    ...members.map(w => ({ band_id: id, user_id: USERS[w].id, role: "member", share: {} })),
  ]), "scratch members");
  return id;
}

export const can = (r: { error: unknown | null }) => !r.error;
