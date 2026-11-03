// Supabase adapter: setlists, their items and library playlists in Postgres, guarded by row-level security
// (see supabase/migrations/0001_init.sql). Used when Supabase is configured and someone is signed in.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEMBER_NOT_FOUND, attachmentKind, effectivePerms, DEFAULT_BAND_PERMS, type AppNotification, type Attachment, type Band, type BandCandidate, type BandPerms, type BandRole, type BandShare, type DataStore, type Lick, type LickFields, type LibraryPlaylist, type Resource, type ResourceFields, type Member, type Note, type NoteHome, type Profile, type NoteTag, type Role, Setlist, SetlistItem, Version, Visibility } from "./types";

interface SetlistRow {
  id: string;
  owner: string;
  name: string;
  spotify_uri: string | null;
  visibility: Visibility;
  band_id?: string | null;
  bands?: { name: string } | null;
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
interface NotificationRow {
  id: string;
  kind: AppNotification["kind"];
  payload: { setlist_id?: string; setlist_name?: string; item_id?: string; band_id?: string; band_name?: string };
  actor: string | null;
  read_at: string | null;
  created_at: string;
}
interface AttachmentRow {
  id: string;
  note_id: string | null;
  lick_id: string | null;
  profile_id?: string | null;
  band_id?: string | null;
  resource_id: string | null;
  storage_path: string;
  kind: Attachment["kind"];
  name: string;
  mime: string;
  size: number;
  created_by: string;
  created_at: string;
}
interface LickRow {
  id: string;
  owner: string;
  title: string;
  body: string;
  tags: string[] | null;
  progression: string | null;
  prog_key: string | null;
  notation: string | null;
  created_at: string;
  updated_at: string;
}
interface PlaylistRow { id: string; name: string; songs: string[] | null }

interface LinkRow { id: string; created_by: string; licks: LickRow | null }

const LICK_COLS = "id, owner, title, body, tags, progression, prog_key, notation, created_at, updated_at";
const lickCols = (f: LickFields) =>
  ({ title: f.title, body: f.body, tags: f.tags, progression: f.progression || null, prog_key: f.progression && f.key ? f.key : null, notation: f.notation || null });
const LINK_COLS = "id, created_by, licks(" + LICK_COLS + ")";
const ATT_COLS = "id, note_id, lick_id, profile_id, band_id, resource_id, storage_path, kind, name, mime, size, created_by, created_at";
interface ResourceRow { id: string; kind: Resource["kind"]; title: string; url: string | null; tags: string[] | null; note: string; created_at: string; updated_at: string }
const RES_COLS = "id, kind, title, url, tags, note, created_at, updated_at";
const toResource = (r: ResourceRow): Resource => ({
  id: r.id, kind: r.kind, title: r.title, url: r.url || "", tags: r.tags || [], note: r.note, createdAt: r.created_at, updatedAt: r.updated_at,
});
const resCols = (f: ResourceFields) => ({ kind: f.kind, title: f.title, url: f.kind === "link" ? f.url : null, tags: f.tags, note: f.note });
const BUCKET = "attachments";
const SETLIST_COLS = "id, owner, name, spotify_uri, visibility, band_id, bands(name), setlist_items(id, position, set_no, song, shift, versions)";
const NOTE_COLS = "id, author, setlist_id, setlist_item_id, song_key, parent_id, tag, body, created_at, updated_at";

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Couldn't ${what}: ${error ? error.message : "unknown error"}`);
}

function toSetlist(r: SetlistRow, role: Role): Setlist {
  const items: SetlistItem[] = (r.setlist_items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(it => ({ id: it.id, raw: it.song, set: it.set_no === 2 ? 2 : 1, shift: it.shift, versions: it.versions || [] }));
  return { id: r.id, name: r.name, spotify: r.spotify_uri, visibility: r.visibility, role, items, band: r.band_id && r.bands ? { id: r.band_id, name: r.bands.name } : null };
}

const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id, noteId: r.note_id, lickId: r.lick_id, profileId: r.profile_id ?? null, bandId: r.band_id ?? null, resourceId: r.resource_id, path: r.storage_path, kind: r.kind, name: r.name, mime: r.mime, size: Number(r.size),
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

interface BandRow { id: string; name: string; default_perms: BandPerms; bio: string | null; contact: Record<string, string> | null; epk_slug: string | null; chat_url: string | null }
interface MemberRow { band_id: string; role: BandRole; plays: string[] | null; perms: Partial<BandPerms> | null }
interface MemberListRow {
  user_id: string; display_name: string | null; role: BandRole; plays: string[] | null; perms: Partial<BandPerms> | null;
  bio: string | null; instruments: string[] | null; contact: Record<string, string> | null;
}
const BAND_COLS = "id, name, default_perms, bio, contact, epk_slug, chat_url";
function toBand(b: BandRow, m: MemberRow): Band {
  const defaultPerms = { ...DEFAULT_BAND_PERMS, ...(b.default_perms || {}) };
  return {
    id: b.id, name: b.name, role: m.role, defaultPerms, perms: effectivePerms(m.role, m.perms, defaultPerms), plays: m.plays || [],
    bio: b.bio || "", contact: b.contact || {}, epkSlug: b.epk_slug, chatUrl: b.chat_url,
  };
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
      // no direct share: you may be in through a band (editor or viewer, by the band's permissions)
      for (const id of others.filter(i => !roles.has(i))) {
        const r = await sb.rpc("setlist_role", { p_setlist: id });
        if (r.data === "editor" || r.data === "viewer") roles.set(id, r.data);
      }
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
    : h.kind === "band" ? { band_id: h.bandId }
    : h.kind === "setlist" ? { setlist_id: h.setlistId }
    : { setlist_id: h.setlistId, setlist_item_id: itemUuid(h.setlistId, h.itemId) };

  const toLick = (r: LickRow, nm: Map<string, string>): Lick => ({
    id: r.id, ownerId: r.owner, ownerName: r.owner === userId ? "You" : nm.get(r.owner) || "Member", mine: r.owner === userId,
    title: r.title, body: r.body, tags: r.tags || [],
    progression: r.progression || "", key: r.prog_key || "", notation: r.notation || "", createdAt: r.created_at, updatedAt: r.updated_at,
  });

  /** Uploads `file` under `dir` and records it as an attachment with `parent` ({ note_id } or { lick_id }). */
  const upload = async (dir: string, parent: { note_id: string } | { lick_id: string } | { profile_id: string } | { resource_id: string } | { band_id: string }, file: File, onProgress?: (p: number) => void): Promise<Attachment> => {
    const kind = attachmentKind(file.type, file.name);
    if (!kind) throw new Error("Only PDF, image, audio and MusicXML files can be attached.");
    const mime = (file.type || "application/octet-stream").split(";")[0].trim();
    const path = `${dir}/${newUuid()}-${safeName(file.name)}`;
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
      .insert({ ...parent, storage_path: path, kind, name: file.name.slice(0, 300), mime, size: file.size })
      .select(ATT_COLS).single();
    if (error) {
      await sb.storage.from(BUCKET).remove([path]);
      fail("save that attachment", error);
    }
    return toAttachment(data as AttachmentRow);
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
        shared = (r.data || []) as unknown as SetlistRow[];
      }
      const roles = new Map(memberships.map(m => [m.setlist_id, m.role]));
      return [
        ...((own.data || []) as unknown as SetlistRow[]).map(r => toSetlist(r, "owner")),
        ...shared.filter(r => r.owner !== userId).map(r => toSetlist(r, roles.get(r.id) || "viewer")),
      ];
    },

    async getSetlist(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await sb.from("setlists").select(SETLIST_COLS).eq("id", id).maybeSingle();
      if (error) fail("open that setlist", error);
      if (!data) return null;
      const row = data as unknown as SetlistRow;
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

    async listCollaborators() {
      const { data, error } = await sb.rpc("recent_collaborators");
      if (error) fail("load recent collaborators", error);
      return ((data || []) as { user_id: string; display_name: string | null }[]).map(r => ({ userId: r.user_id, name: r.display_name || "Member" }));
    },

    async addCollaborator(setlistId, uid, role) {
      const { error } = await sb.rpc("add_setlist_collaborator", { p_setlist: setlistId, p_user: uid, p_role: role });
      if (error) fail("add that person", error);
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

    async listNotifications() {
      const { data, error } = await sb.from("notifications").select("id, kind, payload, actor, read_at, created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (error) fail("load notifications", error);
      const rows = ((data || []) as NotificationRow[]).filter(r => r.payload?.setlist_id || r.payload?.band_id);
      const nm = await namesOf(rows.flatMap(r => r.actor ? [r.actor] : []));
      return rows.map(r => ({
        id: r.id, kind: r.kind, setlistId: r.payload.setlist_id || null, setlistName: r.payload.setlist_name || "a setlist",
        bandId: r.payload.band_id || null, bandName: r.payload.band_name || "a band",
        itemId: r.payload.item_id || null, actorName: (r.actor && nm.get(r.actor)) || "Someone", read: !!r.read_at, createdAt: r.created_at,
      }));
    },

    async markNotificationsRead(ids) {
      let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      q = ids ? q.in("id", ids) : q.eq("user_id", userId);
      const { error } = await q;
      if (error) fail("mark notifications read", error);
    },

    async listNotes(home) {
      let q = sb.from("notes").select(NOTE_COLS);
      if (home.kind === "band") q = q.eq("band_id", home.bandId);
      else if (home.kind === "setlist") q = q.eq("setlist_id", home.setlistId).is("setlist_item_id", null);
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
      const base = home.kind === "song" ? "user/" + userId : home.kind === "band" ? "band/" + home.bandId : "setlist/" + home.setlistId;
      return upload(`${base}/${noteId}`, { note_id: noteId }, file, onProgress);
    },

    async uploadLickAttachment(lickId, file, onProgress) {
      return upload(`user/${userId}/licks/${lickId}`, { lick_id: lickId }, file, onProgress);
    },

    async getMyProfile() {
      const { data, error } = await sb.rpc("my_profile");
      if (error) fail("load your profile", error);
      const r = ((data || []) as { display_name: string | null; bio: string | null; instruments: string[] | null; contact: Profile["contact"] | null; share: Profile["share"] | null; epk_slug: string | null }[])[0];
      return { displayName: r?.display_name || "", bio: r?.bio || "", instruments: r?.instruments || [], contact: r?.contact || {}, share: r?.share || {}, epkSlug: r?.epk_slug ?? null };
    },

    async updateMyProfile(p) {
      const { error } = await sb.from("profiles").update({
        display_name: p.displayName.trim() || null, bio: p.bio.trim() || null, instruments: p.instruments, contact: p.contact, share: p.share, epk_slug: p.epkSlug,
      }).eq("id", userId);
      if (error?.code === "23505") throw new Error("That page address is taken. Try another.");
      if (error) fail("save your profile", error);
    },

    async listProfileFiles() {
      const { data, error } = await sb.from("attachments").select(ATT_COLS).eq("profile_id", userId).order("created_at");
      if (error) fail("load your files", error);
      return ((data || []) as AttachmentRow[]).map(toAttachment);
    },

    async uploadProfileFile(file, onProgress) {
      return upload(`user/${userId}/profile`, { profile_id: userId }, file, onProgress);
    },

    async listLicks() {
      const { data, error } = await sb.from("licks").select(LICK_COLS).eq("owner", userId).order("created_at", { ascending: false });
      if (error) fail("load your licks", error);
      return ((data || []) as LickRow[]).map(r => toLick(r, names));
    },

    async getLick(id) {
      const { data, error } = await sb.from("licks").select(LICK_COLS).eq("id", id).maybeSingle();
      if (error) fail("load that lick", error);
      if (!data) return null;
      const r = data as LickRow;
      await namesOf([r.owner]);
      return toLick(r, names);
    },

    async createLick(f) {
      const { data, error } = await sb.from("licks").insert(lickCols(f)).select(LICK_COLS).single();
      if (error) fail("save that lick", error);
      return toLick(data as LickRow, names);
    },

    async updateLick(id, f) {
      const { data, error } = await sb.from("licks").update(lickCols(f)).eq("id", id).select("id");
      if (error) fail("save that lick", error);
      if (!data || !data.length) fail("save that lick", { message: "not allowed" });
    },

    async deleteLick(id) {
      const at = await sb.from("attachments").select("storage_path").eq("lick_id", id);
      const paths = ((at.data || []) as { storage_path: string }[]).map(r => r.storage_path);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("licks").delete().eq("id", id);
      if (error) fail("delete that lick", error);
    },

    async listResources() {
      const { data, error } = await sb.from("resources").select(RES_COLS).eq("owner", userId).order("created_at", { ascending: false });
      if (error) fail("load your resources", error);
      return ((data || []) as ResourceRow[]).map(toResource);
    },

    async createResource(f) {
      const { data, error } = await sb.from("resources").insert(resCols(f)).select(RES_COLS).single();
      if (error) fail("save that resource", error);
      return toResource(data as ResourceRow);
    },

    async updateResource(id, f) {
      const { data, error } = await sb.from("resources").update(resCols(f)).eq("id", id).select("id");
      if (error) fail("save that resource", error);
      if (!data || !data.length) fail("save that resource", { message: "not allowed" });
    },

    async deleteResource(id) {
      const at = await sb.from("attachments").select("storage_path").eq("resource_id", id);
      const paths = ((at.data || []) as { storage_path: string }[]).map(r => r.storage_path);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("resources").delete().eq("id", id);
      if (error) fail("delete that resource", error);
    },

    async uploadResourceFile(resourceId, file, onProgress) {
      return upload(`user/${userId}/resources/${resourceId}`, { resource_id: resourceId }, file, onProgress);
    },

    async listResourceFiles(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.from("attachments").select(ATT_COLS).in("resource_id", ids).order("created_at");
      if (error) fail("load the files", error);
      return ((data || []) as AttachmentRow[]).map(toAttachment);
    },

    async listResourceLinks(songKey) {
      const { data, error } = await sb.from("resource_links").select("id, resources(" + RES_COLS + ")").eq("created_by", userId).eq("song_key", songKey).order("created_at");
      if (error) fail("load the resources", error);
      return ((data || []) as unknown as { id: string; resources: ResourceRow | null }[]).filter(r => r.resources)
        .map(r => ({ id: r.id, resource: toResource(r.resources as ResourceRow) }));
    },

    async linkResource(id, songKey) {
      const { data, error } = await sb.from("resource_links").insert({ resource_id: id, song_key: songKey }).select("id, resources(" + RES_COLS + ")").single();
      if (error) fail(error.code === "23505" ? "add that resource: it's already here" : "add that resource", error);
      const r = data as unknown as { id: string; resources: ResourceRow };
      return { id: r.id, resource: toResource(r.resources) };
    },

    async unlinkResource(linkId) {
      const { data, error } = await sb.from("resource_links").delete().eq("id", linkId).select("id");
      if (error) fail("remove that resource", error);
      if (!data || !data.length) fail("remove that resource", { message: "not allowed" });
    },

    async listLickLinks(home) {
      let q = sb.from("lick_links").select(LINK_COLS);
      q = home.kind === "item" ? q.eq("setlist_item_id", itemUuid(home.setlistId, home.itemId))
        : q.eq("song_key", home.songKey).is("setlist_id", null).eq("created_by", userId);
      const { data, error } = await q.order("created_at");
      if (error) fail("load the licks", error);
      const rows = ((data || []) as unknown as LinkRow[]).filter(r => r.licks);
      await namesOf(rows.map(r => (r.licks as LickRow).owner));
      return rows.map(r => ({ id: r.id, createdBy: r.created_by, lick: toLick(r.licks as LickRow, names) }));
    },

    async linkLick(lickId, home) {
      const cols = home.kind === "item"
        ? { setlist_id: home.setlistId, setlist_item_id: itemUuid(home.setlistId, home.itemId) }
        : { song_key: home.songKey };
      const { data, error } = await sb.from("lick_links").insert({ lick_id: lickId, ...cols }).select(LINK_COLS).single();
      if (error) fail(error.code === "23505" ? "add that lick: it's already here" : "add that lick", error);
      const r = data as unknown as LinkRow;
      await namesOf([(r.licks as LickRow).owner]);
      return { id: r.id, createdBy: r.created_by, lick: toLick(r.licks as LickRow, names) };
    },

    async unlinkLick(linkId) {
      const { data, error } = await sb.from("lick_links").delete().eq("id", linkId).select("id");
      if (error) fail("remove that lick", error);
      if (!data || !data.length) fail("remove that lick", { message: "not allowed" });
    },

    async copyLick(lickId) {
      const src = await sb.from("licks").select(LICK_COLS).eq("id", lickId).single();
      if (src.error) fail("copy that lick", src.error);
      const s = src.data as LickRow;
      const ins = await sb.from("licks").insert({ title: s.title, body: s.body, tags: s.tags || [], progression: s.progression, prog_key: s.prog_key, notation: s.notation }).select(LICK_COLS).single();
      if (ins.error) fail("copy that lick", ins.error);
      const copy = ins.data as LickRow;
      const files = await sb.from("attachments").select("storage_path, kind, name, mime, size").eq("lick_id", lickId);
      for (const f of (files.data || []) as { storage_path: string; kind: string; name: string; mime: string; size: number }[]) {
        const path = `user/${userId}/licks/${copy.id}/${newUuid()}-${safeName(f.name)}`;
        const cp = await sb.storage.from(BUCKET).copy(f.storage_path, path);
        if (cp.error) continue; // the lick is still copied; a file that can't be read is skipped
        const row = await sb.from("attachments").insert({ lick_id: copy.id, storage_path: path, kind: f.kind, name: f.name, mime: f.mime, size: f.size });
        if (row.error) await sb.storage.from(BUCKET).remove([path]);
      }
      return toLick(copy, names);
    },

    async listLickAttachments(lickIds) {
      if (!lickIds.length) return [];
      const { data, error } = await sb.from("attachments").select(ATT_COLS).in("lick_id", lickIds).order("created_at");
      if (error) fail("load the attachments", error);
      return ((data || []) as AttachmentRow[]).map(toAttachment);
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

    async listBands() {
      const mem = await sb.from("band_members").select("band_id, role, plays, perms").eq("user_id", userId);
      if (mem.error) fail("load your bands", mem.error);
      const rows = (mem.data || []) as MemberRow[];
      if (!rows.length) return [];
      const { data, error } = await sb.from("bands").select(BAND_COLS).in("id", rows.map(r => r.band_id)).order("created_at");
      if (error) fail("load your bands", error);
      const mine = new Map(rows.map(r => [r.band_id, r]));
      return ((data || []) as BandRow[]).flatMap(b => mine.has(b.id) ? [toBand(b, mine.get(b.id) as MemberRow)] : []);
    },

    async getBand(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [b, m] = await Promise.all([
        sb.from("bands").select(BAND_COLS).eq("id", id).maybeSingle(),
        sb.from("band_members").select("band_id, role, plays, perms").eq("band_id", id).eq("user_id", userId).maybeSingle(),
      ]);
      if (b.error) fail("open that band", b.error);
      if (m.error) fail("open that band", m.error);
      return b.data && m.data ? toBand(b.data as BandRow, m.data as MemberRow) : null;
    },

    async createBand(name, defaultPerms) {
      const { data, error } = await sb.rpc("create_band", { p_name: name, p_default_perms: defaultPerms });
      if (error) fail("create the band", error);
      const band = await this.getBand(data as string);
      if (!band) fail("create the band", { message: "not found" });
      return band;
    },

    async updateBand(id, f) {
      const { data, error } = await sb.from("bands").update({
        name: f.name, default_perms: f.defaultPerms, bio: f.bio.trim() || null, contact: f.contact, epk_slug: f.epkSlug,
        ...(f.chatUrl !== undefined ? { chat_url: f.chatUrl } : {}),
      }).eq("id", id).select("id");
      if (error?.code === "23505") throw new Error("That page address is taken. Try another.");
      if (error) fail("save the band", error);
      if (!data || !data.length) fail("save the band", { message: "not allowed" });
    },

    async deleteBand(id) {
      // remove the files of the press kit and the band notes first (the rows go with the band)
      const notes = await sb.from("notes").select("id").eq("band_id", id);
      const ids = ((notes.data || []) as { id: string }[]).map(r => r.id);
      const kit = await sb.from("attachments").select("storage_path").eq("band_id", id);
      const att = ids.length ? await sb.from("attachments").select("storage_path").in("note_id", ids) : { data: [] };
      const paths = [...(kit.data || []), ...(att.data || [])].map((r: { storage_path: string }) => r.storage_path);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.rpc("band_delete", { p_band: id });
      if (error) fail("delete the band", error);
    },

    async listBandMembers(bandId) {
      const [list, def] = await Promise.all([
        sb.rpc("band_member_list", { p_band: bandId }),
        sb.from("bands").select("default_perms").eq("id", bandId).maybeSingle(),
      ]);
      if (list.error) fail("load the members", list.error);
      const dp = { ...DEFAULT_BAND_PERMS, ...((def.data as { default_perms: Partial<BandPerms> } | null)?.default_perms || {}) };
      return ((list.data || []) as MemberListRow[]).map(r => ({
        userId: r.user_id, name: r.display_name || "Member", role: r.role, plays: r.plays || [], perms: r.perms,
        effective: effectivePerms(r.role, r.perms, dp), bio: r.bio || "", instruments: r.instruments || [], contact: r.contact || {},
      }));
    },

    async searchBandUsers(bandId, q) {
      const { data, error } = await sb.rpc("band_search_users", { p_band: bandId, p_q: q });
      if (error) fail("search for people", error);
      return ((data || []) as { user_id: string; display_name: string | null; instruments: string[] | null }[])
        .map((r): BandCandidate => ({ userId: r.user_id, name: r.display_name || "Member", instruments: r.instruments || [] }));
    },

    async addBandMember(bandId, uid, plays) {
      const { error } = await sb.rpc("band_add_member", { p_band: bandId, p_user: uid, p_plays: plays });
      if (error) fail("add that person", error);
    },

    async createBandInvite(bandId) {
      const { data, error } = await sb.rpc("band_create_invite", { p_band: bandId });
      if (error) fail("make an invite link", error);
      return data as string;
    },

    async revokeBandInvites(bandId) {
      const { error } = await sb.rpc("band_revoke_invites", { p_band: bandId });
      if (error) fail("switch off the links", error);
    },

    async bandInviteInfo(token) {
      const { data, error } = await sb.rpc("band_invite_info", { p_token: token });
      if (error) fail("check that invite", error);
      const r = ((data || []) as { band_id: string; band_name: string }[])[0];
      return r ? { bandId: r.band_id, name: r.band_name } : null;
    },

    async acceptBandInvite(token, plays) {
      const { data, error } = await sb.rpc("band_accept_invite", { p_token: token, p_plays: plays });
      if (error) fail("join the band", error);
      return data as string;
    },

    async setBandMember(bandId, uid, role, perms) {
      const { error } = await sb.rpc("band_set_member", { p_band: bandId, p_user: uid, p_role: role, p_perms: perms });
      if (error) fail("change that person", error);
    },

    async removeBandMember(bandId, uid) {
      const { error } = await sb.rpc("band_remove_member", { p_band: bandId, p_user: uid });
      if (error) fail("remove that person", error);
    },

    async leaveBand(bandId) {
      const { error } = await sb.rpc("band_leave", { p_band: bandId });
      if (error) fail("leave the band", error);
    },

    async setBandPlays(bandId, plays) {
      const { error } = await sb.rpc("band_set_plays", { p_band: bandId, p_plays: plays });
      if (error) fail("save what you play", error);
    },

    async getBandShare(bandId) {
      const { data, error } = await sb.rpc("band_my_share", { p_band: bandId });
      if (error) fail("load what the band sees", error);
      return (data as BandShare | null) ?? null;
    },

    async setBandShare(bandId, share) {
      const { error } = await sb.rpc("band_set_share", { p_band: bandId, p_share: share });
      if (error) fail("save what the band sees", error);
    },

    async listBandSetlists(bandId) {
      const { data, error } = await sb.from("setlists").select("id, owner, name, setlist_items(id)").eq("band_id", bandId).order("created_at");
      if (error) fail("load the band's setlists", error);
      const rows = (data || []) as { id: string; owner: string; name: string; setlist_items: { id: string }[] | null }[];
      const nm = await namesOf(rows.map(r => r.owner));
      return rows.map(r => ({ id: r.id, name: r.name, tunes: (r.setlist_items || []).length, ownerId: r.owner, mine: r.owner === userId, ownerName: r.owner === userId ? "You" : nm.get(r.owner) || "Member" }));
    },

    async setSetlistBand(setlistId, bandId) {
      const { data, error } = await sb.from("setlists").update({ band_id: bandId }).eq("id", setlistId).select("id");
      if (error) fail("share the setlist with the band", error);
      if (!data || !data.length) fail("share the setlist with the band", { message: "not allowed" });
    },

    async listBandFiles(bandId) {
      const { data, error } = await sb.from("attachments").select(ATT_COLS).eq("band_id", bandId).order("created_at");
      if (error) fail("load the band's files", error);
      return ((data || []) as AttachmentRow[]).map(toAttachment);
    },

    async uploadBandFile(bandId, file, onProgress) {
      return upload(`band/${bandId}/kit`, { band_id: bandId }, file, onProgress);
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
