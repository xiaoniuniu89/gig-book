// Supabase adapter: setlists, their items and library playlists in Postgres, guarded by row-level security
// (see supabase/migrations/0001_init.sql). Used when Supabase is configured and someone is signed in.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore, LibraryPlaylist, Role, Setlist, SetlistItem, Version, Visibility } from "./types";

interface SetlistRow {
  id: string;
  owner: string;
  name: string;
  spotify_uri: string | null;
  visibility: Visibility;
  setlist_items?: ItemRow[];
}
interface ItemRow {
  id: string;
  position: number;
  set_no: number;
  song: string;
  shift: number | null;
  versions: Version[] | null;
  note: string | null;
}
interface PlaylistRow { id: string; name: string; songs: string[] | null }

const SETLIST_COLS = "id, owner, name, spotify_uri, visibility, setlist_items(id, position, set_no, song, shift, versions, note)";

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Couldn't ${what}: ${error ? error.message : "unknown error"}`);
}

function toSetlist(r: SetlistRow, role: Role): Setlist {
  const items: SetlistItem[] = (r.setlist_items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(it => ({ id: it.id, raw: it.song, set: it.set_no === 2 ? 2 : 1, shift: it.shift, versions: it.versions || [], note: it.note }));
  return { id: r.id, name: r.name, spotify: r.spotify_uri, visibility: r.visibility, role, items };
}

const newUuid = () => crypto.randomUUID();

export function supabaseStore(sb: SupabaseClient, userId: string): DataStore {
  const roleFor = async (rows: SetlistRow[]): Promise<Map<string, Role>> => {
    const roles = new Map<string, Role>();
    rows.forEach(r => { if (r.owner === userId) roles.set(r.id, "owner"); });
    const others = rows.filter(r => r.owner !== userId).map(r => r.id);
    if (others.length) {
      const { data, error } = await sb.from("setlist_members").select("setlist_id, role").eq("user_id", userId).in("setlist_id", others);
      if (error) fail("load your shared setlists", error);
      (data || []).forEach((m: { setlist_id: string; role: Role }) => roles.set(m.setlist_id, m.role));
    }
    return roles;
  };

  return {
    kind: "supabase",
    newId: () => newUuid(),

    async listSetlists() {
      // Your own setlists, plus the ones shared with you. (Row-level security would also let us read every
      // public setlist, so filter explicitly rather than listing the whole table.)
      const own = await sb.from("setlists").select(SETLIST_COLS).eq("owner", userId).order("created_at");
      if (own.error) fail("load your setlists", own.error);
      const mem = await sb.from("setlist_members").select("setlist_id, role").eq("user_id", userId);
      if (mem.error) fail("load your shared setlists", mem.error);
      const memberships = (mem.data || []) as { setlist_id: string; role: Role }[];
      let shared: SetlistRow[] = [];
      if (memberships.length) {
        const r = await sb.from("setlists").select(SETLIST_COLS).in("id", memberships.map(m => m.setlist_id)).order("created_at");
        if (r.error) fail("load your shared setlists", r.error);
        shared = (r.data || []) as SetlistRow[];
      }
      const roles = new Map(memberships.map(m => [m.setlist_id, m.role]));
      return [
        ...((own.data || []) as SetlistRow[]).map(r => toSetlist(r, "owner")),
        ...shared.filter(r => r.owner !== userId).map(r => toSetlist(r, roles.get(r.id) || "viewer")),
      ];
    },

    async getSetlist(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await sb.from("setlists").select(SETLIST_COLS).eq("id", id).maybeSingle();
      if (error) fail("open that setlist", error);
      if (!data) return null;
      const row = data as SetlistRow;
      const roles = await roleFor([row]);
      return toSetlist(row, roles.get(row.id) || "viewer");
    },

    async saveSetlist(s) {
      const fields = { name: s.name, spotify_uri: s.spotify, visibility: s.visibility || "private" };
      // Update first (works for owners and editors); insert when the row doesn't exist yet.
      const up = await sb.from("setlists").update(fields).eq("id", s.id).select("id");
      if (up.error) fail("save the setlist", up.error);
      if (!up.data || !up.data.length) {
        const ins = await sb.from("setlists").insert({ id: s.id, owner: userId, ...fields });
        if (ins.error) fail("create the setlist", ins.error);
      }
      const items = s.items.map((it, position) => ({
        position, set_no: it.set || 1, song: it.raw, shift: it.shift ?? null, versions: it.versions || [], note: it.note ?? null,
      }));
      const { error } = await sb.rpc("replace_setlist_items", { p_setlist_id: s.id, p_items: items });
      if (error) fail("save the tunes in the setlist", error);
    },

    async deleteSetlist(id) {
      const { error } = await sb.from("setlists").delete().eq("id", id);
      if (error) fail("delete the setlist", error);
    },

    async listLibrary() {
      const { data, error } = await sb.from("library_playlists").select("id, name, songs").eq("owner", userId).order("created_at");
      if (error) fail("load your library", error);
      return ((data || []) as PlaylistRow[]).map(p => ({ id: p.id, name: p.name, songs: p.songs || [] }));
    },

    async saveLibraryPlaylist(p: LibraryPlaylist) {
      const { error } = await sb.from("library_playlists").upsert({ id: p.id, owner: userId, name: p.name, songs: p.songs });
      if (error) fail("save to your library", error);
    },

    async deleteLibraryPlaylist(id) {
      const { error } = await sb.from("library_playlists").delete().eq("id", id);
      if (error) fail("remove that playlist", error);
    },
  };
}
