// Supabase adapter: setlists, their items and library playlists in Postgres, guarded by row-level security
// (see supabase/migrations/0001_init.sql). Used when Supabase is configured and someone is signed in.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEMBER_NOT_FOUND, attachmentKind, type Attachment, type DataStore, type LibraryPlaylist, type Member, type Note, type NoteHome, type NoteTag, type Role, Setlist, SetlistItem, Version, Visibility } from "./types";

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
}
interface NoteRow {
  id: string;
  author: string;
  setlist_id: string | null;
  setlist_item_id: string | null;
  song_key: string | null;
  parent_id: string | null;
  tag: NoteTag | null;
  body: string;
  created_at: string;
  updated_at: string;
}
interface AttachmentRow {
  id: string;
  note_id: string;
  storage_path: string;
  kind: Attachment["kind"];
  name: string;
  mime: string;
  size: number;
  created_by: string;
  created_at: string;
}
interface PlaylistRow { id: string; name: string; songs: string[] | null }

const ATT_COLS = "id, note_id, storage_path, kind, name, mime, size, created_by, created_at";
const BUCKET = "attachments";
const SETLIST_COLS = "id, owner, name, spotify_uri, visibility, setlist_items(id, position, set_no, song, shift, versions)";
const NOTE_COLS = "id, author, setlist_id, setlist_item_id, song_key, parent_id, tag, body, created_at, updated_at";

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Couldn't ${what}: ${error ? error.message : "unknown error"}`);
}

function toSetlist(r: SetlistRow, role: Role): Setlist {
  const items: SetlistItem[] = (r.setlist_items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(it => ({ id: it.id, raw: it.song, set: it.set_no === 2 ? 2 : 1, shift: it.shift, versions: it.versions || [] }));
  return { id: r.id, name: r.name, spotify: r.spotify_uri, visibility: r.visibility, role, items };
}

const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id, noteId: r.note_id, path: r.storage_path, kind: r.kind, name: r.name, mime: r.mime, size: Number(r.size),
  createdBy: r.created_by, createdAt: r.created_at,
});

/** Letters, digits, dot, dash, underscore only; keeps the end of the name (and so the extension). */
const safeName = (n: string): string => n.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(-80) || "file";

const newUuid = () => crypto.randomUUID();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Item ids must be UUIDs and stay the same on every save (notes point at them). Older ids ("s1", from seeds and
 * local setlists) map to a fixed UUID derived from the setlist id + the old id, so an item always gets the same one.
 */
export function itemUuid(setlistId: string, id: string): string {
  if (UUID.test(id)) return id;
  const src = setlistId + ":" + id;
  let hex = "";
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 0x01000193);
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
}

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

  const names = new Map<string, string>();
  const namesOf = async (ids: string[]): Promise<Map<string, string>> => {
    const need = [...new Set(ids)].filter(i => !names.has(i));
    if (need.length) {
      const { data } = await sb.from("profiles").select("id, display_name").in("id", need);
      (data || []).forEach((p: { id: string; display_name: string | null }) => names.set(p.id, p.display_name || "Member"));
    }
    return names;
  };
  const toNote = (r: NoteRow, nm: Map<string, string>): Note => ({
    id: r.id, authorId: r.author, authorName: r.author === userId ? "You" : nm.get(r.author) || "Member", parentId: r.parent_id,
    tag: r.tag, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at,
  });
  const homeCols = (h: NoteHome) => h.kind === "song" ? { song_key: h.songKey }
    : h.kind === "setlist" ? { setlist_id: h.setlistId }
    : { setlist_id: h.setlistId, setlist_item_id: itemUuid(h.setlistId, h.itemId) };

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
        id: itemUuid(s.id, it.id), position, set_no: it.set || 1, song: it.raw, shift: it.shift ?? null, versions: it.versions || [],
      }));
      const { error } = await sb.rpc("replace_setlist_items", { p_setlist_id: s.id, p_items: items });
      if (error) fail("save the tunes in the setlist", error);
    },

    async deleteSetlist(id) {
      const { error } = await sb.from("setlists").delete().eq("id", id);
      if (error) fail("delete the setlist", error);
    },

    async listMembers(setlistId) {
      const { data, error } = await sb.rpc("setlist_member_list", { p_setlist: setlistId });
      if (error) fail("load the band", error);
      return ((data || []) as { user_id: string; display_name: string | null; email: string | null; role: Member["role"] }[])
        .map(m => ({ userId: m.user_id, name: m.display_name || "Member", email: m.email, role: m.role }));
    },

    async addMember(setlistId, email, role) {
      const { error } = await sb.rpc("add_setlist_member", { p_setlist: setlistId, p_email: email, p_role: role });
      if (error) {
        if (error.code === "P0002") throw new Error(MEMBER_NOT_FOUND);
        fail("add that person", error);
      }
    },

    async setMemberRole(setlistId, uid, role) {
      const { data, error } = await sb.from("setlist_members").update({ role }).eq("setlist_id", setlistId).eq("user_id", uid).select("user_id");
      if (error) fail("change that role", error);
      if (!data || !data.length) fail("change that role", { message: "not allowed" });
    },

    async removeMember(setlistId, uid) {
      const { error } = await sb.from("setlist_members").delete().eq("setlist_id", setlistId).eq("user_id", uid);
      if (error) fail("remove that person", error);
    },

    async leaveSetlist(setlistId) {
      const { error } = await sb.from("setlist_members").delete().eq("setlist_id", setlistId).eq("user_id", userId);
      if (error) fail("leave the setlist", error);
    },

    async listNotes(home) {
      let q = sb.from("notes").select(NOTE_COLS);
      if (home.kind === "setlist") q = q.eq("setlist_id", home.setlistId).is("setlist_item_id", null);
      else if (home.kind === "item") q = q.eq("setlist_item_id", itemUuid(home.setlistId, home.itemId));
      else q = q.eq("song_key", home.songKey).is("setlist_id", null).eq("author", userId);
      const { data, error } = await q.order("created_at");
      if (error) fail("load the notes", error);
      const rows = (data || []) as NoteRow[];
      const nm = await namesOf(rows.map(r => r.author));
      return rows.map(r => toNote(r, nm));
    },

    async countNotes(setlistId, itemIds) {
      const { data, error } = await sb.from("notes").select("setlist_item_id").eq("setlist_id", setlistId).not("setlist_item_id", "is", null);
      if (error) fail("load the notes", error);
      const per = new Map<string, number>();
      (data || []).forEach((r: { setlist_item_id: string }) => per.set(r.setlist_item_id, (per.get(r.setlist_item_id) || 0) + 1));
      const out: Record<string, number> = {};
      itemIds.forEach(id => { const n = per.get(itemUuid(setlistId, id)); if (n) out[id] = n; });
      return out;
    },

    async addNote(home, n) {
      const { data, error } = await sb.from("notes")
        .insert({ ...homeCols(home), body: n.body, tag: n.parentId ? null : n.tag ?? null, parent_id: n.parentId ?? null })
        .select(NOTE_COLS).single();
      if (error) fail("save that note", error);
      const row = data as NoteRow;
      return toNote(row, await namesOf([row.author]));
    },

    async updateNote(id, n) {
      const { data, error } = await sb.from("notes").update({ body: n.body, tag: n.tag ?? null }).eq("id", id).select("id");
      if (error) fail("save that note", error);
      if (!data || !data.length) fail("save that note", { message: "not allowed" });
    },

    async deleteNote(id) {
      // remove the files of the note and its replies first (the rows go with the note)
      const rep = await sb.from("notes").select("id").eq("parent_id", id);
      const ids = [id, ...((rep.data || []) as { id: string }[]).map(r => r.id)];
      const at = await sb.from("attachments").select("storage_path").in("note_id", ids);
      const paths = ((at.data || []) as { storage_path: string }[]).map(r => r.storage_path);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("notes").delete().eq("id", id);
      if (error) fail("delete that note", error);
    },

    async copyNote(noteId, to) {
      const { data, error } = await sb.from("notes").select("body, tag, parent_id").eq("id", noteId).single();
      if (error) fail("copy that note", error);
      const src = data as { body: string; tag: NoteTag | null; parent_id: string | null };
      const ins = await sb.from("notes").insert({ ...homeCols(to), body: src.body, tag: src.parent_id ? null : src.tag });
      if (ins.error) fail("copy that note", ins.error);
    },

    async listAttachments(noteIds) {
      if (!noteIds.length) return [];
      const { data, error } = await sb.from("attachments").select(ATT_COLS).in("note_id", noteIds).order("created_at");
      if (error) fail("load the attachments", error);
      return ((data || []) as AttachmentRow[]).map(toAttachment);
    },

    async uploadAttachment(home, noteId, file, onProgress) {
      const kind = attachmentKind(file.type, file.name);
      if (!kind) throw new Error("Only PDF, image and audio files can be attached.");
      const mime = (file.type || "application/octet-stream").split(";")[0].trim();
      const base = home.kind === "song" ? "user/" + userId : "setlist/" + home.setlistId;
      const path = `${base}/${noteId}/${newUuid()}-${safeName(file.name)}`;
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sign in again to upload.");
      // XHR rather than supabase-js, to get upload progress
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
        x.setRequestHeader("Authorization", "Bearer " + token);
        x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
        x.setRequestHeader("x-upsert", "false");
        x.setRequestHeader("Content-Type", mime);
        x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        x.onload = () => x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Couldn't upload ${file.name} (${x.status}).`));
        x.onerror = () => reject(new Error(`Couldn't upload ${file.name}: no connection.`));
        x.send(file);
      });
      const { data, error } = await sb.from("attachments")
        .insert({ note_id: noteId, storage_path: path, kind, name: file.name.slice(0, 300), mime, size: file.size })
        .select(ATT_COLS).single();
      if (error) {
        await sb.storage.from(BUCKET).remove([path]);
        fail("save that attachment", error);
      }
      return toAttachment(data as AttachmentRow);
    },

    async deleteAttachment(a) {
      const rm = await sb.storage.from(BUCKET).remove([a.path]);
      if (rm.error) fail("delete that file", rm.error);
      const { error } = await sb.from("attachments").delete().eq("id", a.id);
      if (error) fail("delete that file", error);
    },

    async attachmentUrl(a) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.path, 3600);
      if (error || !data) fail("open that file", error);
      return data.signedUrl;
    },

    async getChartChoice(setlistId, itemId) {
      const { data, error } = await sb.from("chart_choices").select("attachments(" + ATT_COLS + ")")
        .eq("user_id", userId).eq("setlist_item_id", itemUuid(setlistId, itemId)).maybeSingle();
      if (error) fail("load the chart choice", error);
      const a = (data as unknown as { attachments: AttachmentRow | null } | null)?.attachments;
      return a ? toAttachment(a) : null;
    },

    async setChartChoice(setlistId, itemId, attachmentId) {
      const item = itemUuid(setlistId, itemId);
      const { error } = attachmentId
        ? await sb.from("chart_choices").upsert({ user_id: userId, setlist_item_id: item, attachment_id: attachmentId })
        : await sb.from("chart_choices").delete().eq("user_id", userId).eq("setlist_item_id", item);
      if (error) fail("save the chart choice", error);
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
