// Supabase adapter: setlists, their items and library playlists in Postgres, guarded by row-level security
// (see supabase/migrations/0001_init.sql). Used when Supabase is configured and someone is signed in.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSettings } from "../settings";
import { plainError } from "../validate";
import type { Hit, Feels } from "../hits";
import { MAX_FILE_MB, MAX_LEAD_SHEET_MB, MAX_RECORDING_MB, type OriginalSong, type UpdateWhat,MAX_PRACTICE_BYTES, type Gig, type GigFields, type GigPerson, type GigPhoto,type Transcription, type TranscriptionFields, MEMBER_NOT_FOUND, attachmentKind, effectivePerms, DEFAULT_BAND_PERMS, type AppNotification, type Arrangement, type Attachment, type Band, type BandCandidate, type BandPerms, type BandRole, type BandShare, type Chart, type DataStore, type TuneVersion, VERSION_DAILY_LIMIT, type Lick, type LickFields, type LibraryPlaylist, type Resource, type ResourceFields, type Member, type Note, type NoteHome, type Profile, type NoteTag, type Role, Setlist, SetlistItem, Version, Visibility } from "./types";

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
  hits: Hit[] | null;
  feels: Feels | null;
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
  payload: { setlist_id?: string; setlist_name?: string; item_id?: string; band_id?: string; band_name?: string; gig_id?: string; gig_title?: string; what?: UpdateWhat };
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
interface VersionRow {
  id: string; song_key: string; name: string; changes: string; source: "ai" | "community";
  checked_by: string | null; checked_at: string | null; created_by: string | null; created_at: string;
}
const VERSION_COLS = "id, song_key, name, changes, source, checked_by, checked_at, created_by, created_at";
interface ChartRow {
  id: string; owner: string; song_key: string; setlist_id: string | null; name: string;
  file_path: string; file_kind: "pdf" | "image" | "musicxml"; file_name: string; file_mime: string; file_size: number;
  audio_path: string | null; audio_name: string | null; audio_mime: string | null; audio_size: number | null;
  created_at: string;
}
const CHART_COLS = "id, owner, song_key, setlist_id, name, file_path, file_kind, file_name, file_mime, file_size, audio_path, audio_name, audio_mime, audio_size, created_at";
const CHART_BUCKET = "charts";
const PRACTICE_BUCKET = "practice";
const TRANSCRIPTION_BUCKET = "transcriptions";
interface TranscriptionRow {
  id: string; owner: string; title: string; song_key: string | null; tune_title: string; tune_composer: string; instrument: string; player: string;
  recording: string; youtube: string | null; visibility: "private" | "bands" | "public"; file_path: string; file_kind: "pdf" | "image" | "musicxml";
  file_name: string; file_mime: string; file_size: number; created_at: string; updated_at: string;
}
const TR_COLS = "id, owner, title, song_key, tune_title, tune_composer, instrument, player, recording, youtube, visibility, file_path, file_kind, file_name, file_mime, file_size, created_at, updated_at";
const trFields = (f: TranscriptionFields) => ({
  title: f.title, song_key: f.songKey, tune_title: f.tuneTitle, tune_composer: f.tuneComposer, instrument: f.instrument, player: f.player,
  recording: f.recording, youtube: f.youtube, visibility: f.visibility,
});
const LEADSHEET_BUCKET = "leadsheets";
const RECORDING_BUCKET = "original-recordings";
interface OriginalRow {
  id: string; owner: string; raw: string; title: string; composer: string; visibility: "private" | "band" | "public"; band_id: string | null;
  lead_sheet_path: string | null; lead_sheet_kind: "pdf" | "image" | null; lead_sheet_name: string | null; lead_sheet_mime: string | null; lead_sheet_size: number | null;
  original_recordings: { path: string; name: string; mime: string; size: number; created_at: string }[] | null;
  created_at: string; updated_at: string;
}
const OR_COLS = "id, owner, raw, title, composer, visibility, band_id, lead_sheet_path, lead_sheet_kind, lead_sheet_name, lead_sheet_mime, lead_sheet_size, created_at, updated_at, original_recordings(path, name, mime, size, created_at)";
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
interface ArrangementRow { id: string; name: string; song: string; shift: number | null; versions: Version[] | null; hits: Hit[] | null; feels: Feels | null; created_at: string }
const ARR_COLS = "id, name, song, shift, versions, hits, feels, created_at";
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
const SETLIST_COLS = "id, owner, name, spotify_uri, visibility, band_id, bands(name), setlist_items(id, position, set_no, song, shift, versions, hits, feels)";
const NOTE_COLS = "id, author, setlist_id, setlist_item_id, song_key, parent_id, tag, body, created_at, updated_at";

function fail(what: string, error: { message: string; code?: string } | null): never {
  if (error) console.error(`Couldn't ${what}:`, error);
  throw new Error(`Couldn't ${what}. ${plainError(error)}`);
}

function toSetlist(r: SetlistRow, role: Role): Setlist {
  const items: SetlistItem[] = (r.setlist_items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(it => ({ id: it.id, raw: it.song, set: it.set_no || 1, shift: it.shift, versions: it.versions || [], hits: it.hits || [], feels: it.feels || {} }));
  return { id: r.id, name: r.name, spotify: r.spotify_uri, visibility: r.visibility, role, items, band: r.band_id && r.bands ? { id: r.band_id, name: r.bands.name } : null };
}

const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id, noteId: r.note_id, lickId: r.lick_id, profileId: r.profile_id ?? null, bandId: r.band_id ?? null, resourceId: r.resource_id, path: r.storage_path, kind: r.kind, name: r.name, mime: r.mime, size: Number(r.size),
  createdBy: r.created_by, createdAt: r.created_at,
});

/** Letters, digits, dot, dash, underscore only; keeps the end of the name (and so the extension). */
const safeName = (n: string): string => n.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(-80) || "file";

const newUuid = () => crypto.randomUUID();
const mimeOf = (f: File): string => (f.type || "application/octet-stream").split(";")[0].trim();
interface GigRow {
  id: string; created_by: string; band_id: string | null; title: string; gig_date: string; start_time: string | null;
  venue: string; address: string; schedule: string; notes: string; lineup_can_chart?: boolean; bands?: { name: string } | null;
}
const GIG_COLS = "id, created_by, band_id, title, gig_date, start_time, venue, address, schedule, notes, lineup_can_chart, bands(name)";
const gigCols = (f: GigFields) => ({
  title: f.title.trim(), gig_date: f.date, start_time: f.time.trim() || null, venue: f.venue.trim(), address: f.address.trim(),
  schedule: f.schedule, notes: f.notes, band_id: f.bandId, ...(f.lineupCharts === undefined ? {} : { lineup_can_chart: f.lineupCharts }),
});
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

interface BandRow { id: string; name: string; default_perms: BandPerms; bio: string | null; contact: Record<string, string> | null; epk_slug: string | null; chat_url: string | null; kit_members?: boolean }
interface MemberRow { band_id: string; role: BandRole; plays: string[] | null; perms: Partial<BandPerms> | null }
interface MemberListRow {
  user_id: string; display_name: string | null; role: BandRole; plays: string[] | null; perms: Partial<BandPerms> | null;
  bio: string | null; instruments: string[] | null; contact: Record<string, string> | null;
}
const BAND_COLS = "id, name, default_perms, bio, contact, epk_slug, chat_url, kit_members";
function toBand(b: BandRow, m: MemberRow): Band {
  const defaultPerms = { ...DEFAULT_BAND_PERMS, ...(b.default_perms || {}) };
  return {
    id: b.id, name: b.name, role: m.role, defaultPerms, perms: effectivePerms(m.role, m.perms, defaultPerms), plays: m.plays || [],
    bio: b.bio || "", contact: b.contact || {}, epkSlug: b.epk_slug, chatUrl: b.chat_url, kitMembers: !!b.kit_members,
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
  // signed file links last an hour; the same one is handed out again while it has 10 minutes left, so a file the browser
  // already fetched (a PDF chart you flip back to) isn't downloaded again under a new address
  const signed = new Map<string, { url: string; until: number }>();
  const signedUrl = async (bucket: string, path: string, what: string): Promise<string> => {
    const k = bucket + "/" + path, hit = signed.get(k);
    if (hit && hit.until > Date.now() + 10 * 60e3) return hit.url;
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) fail(what, error);
    if (signed.size > 300) signed.clear();
    signed.set(k, { url: data.signedUrl, until: Date.now() + 3600e3 });
    return data.signedUrl;
  };
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

  const toChart = (r: ChartRow): Chart => {
    const part = (path: string, kind: Attachment["kind"], name: string, mime: string, size: number): Attachment => ({
      id: r.id + (kind === "audio" ? ":audio" : ""), noteId: null, lickId: null, resourceId: null, bucket: CHART_BUCKET, path, kind, name, mime, size: Number(size),
      createdBy: r.owner, createdAt: r.created_at,
    });
    return {
      id: r.id, mine: r.owner === userId, songKey: r.song_key, setlistId: r.setlist_id, name: r.name, createdAt: r.created_at,
      file: part(r.file_path, r.file_kind, r.file_name, r.file_mime, r.file_size),
      audio: r.audio_path && r.audio_name && r.audio_mime ? part(r.audio_path, "audio", r.audio_name, r.audio_mime, r.audio_size ?? 0) : null,
    };
  };

  const toTranscription = (r: TranscriptionRow, nm: Map<string, string>): Transcription => ({
    id: r.id, ownerId: r.owner, ownerName: r.owner === userId ? "You" : nm.get(r.owner) || "Member", mine: r.owner === userId, title: r.title,
    songKey: r.song_key, tuneTitle: r.tune_title, tuneComposer: r.tune_composer, instrument: r.instrument, player: r.player, recording: r.recording,
    youtube: r.youtube, visibility: r.visibility, createdAt: r.created_at, updatedAt: r.updated_at,
    file: { id: r.id, noteId: null, lickId: null, resourceId: null, bucket: TRANSCRIPTION_BUCKET, path: r.file_path, kind: r.file_kind, name: r.file_name, mime: r.file_mime, size: Number(r.file_size), createdBy: r.owner, createdAt: r.created_at },
  });

  const toOriginal = (r: OriginalRow, nm: Map<string, string>): OriginalSong => ({
    id: r.id, ownerId: r.owner, ownerName: r.owner === userId ? "You" : nm.get(r.owner) || "Member", mine: r.owner === userId, raw: r.raw,
    title: r.title, composer: r.composer, visibility: r.visibility, bandId: r.band_id, createdAt: r.created_at, updatedAt: r.updated_at,
    leadSheet: r.lead_sheet_path && r.lead_sheet_kind
      ? { path: r.lead_sheet_path, kind: r.lead_sheet_kind, name: r.lead_sheet_name || "lead sheet", mime: r.lead_sheet_mime || "", size: Number(r.lead_sheet_size) || 0 } : null,
    recordings: (r.original_recordings ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(x => ({ path: x.path, name: x.name, mime: x.mime, size: Number(x.size) || 0 })),
  });
  const leadSheetCols = (path: string, file: File, mime: string) => {
    const kind = attachmentKind(file.type, file.name);
    if (kind !== "pdf" && kind !== "image") throw new Error("A lead sheet has to be a PDF or a photo.");
    if (file.size > MAX_LEAD_SHEET_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_LEAD_SHEET_MB} MB.`);
    return { lead_sheet_path: path, lead_sheet_kind: kind, lead_sheet_name: file.name.slice(0, 300), lead_sheet_mime: mime, lead_sheet_size: file.size };
  };
  const noSheet = { lead_sheet_path: null, lead_sheet_kind: null, lead_sheet_name: null, lead_sheet_mime: null, lead_sheet_size: null };

  /** Gig rows with who can edit: the creator, or an admin of its band. */
  const toGigs = async (rows: GigRow[]): Promise<Gig[]> => {
    const bandIds = [...new Set(rows.flatMap(r => r.band_id ? [r.band_id] : []))];
    const admin = new Set<string>();
    if (bandIds.length) {
      const { data } = await sb.from("band_members").select("band_id").eq("user_id", userId).eq("role", "admin").in("band_id", bandIds);
      (data || []).forEach((m: { band_id: string }) => admin.add(m.band_id));
    }
    return rows.map(r => ({
      id: r.id, title: r.title, date: r.gig_date, time: r.start_time || "", venue: r.venue, address: r.address, schedule: r.schedule, notes: r.notes,
      band: r.band_id ? { id: r.band_id, name: r.bands?.name || "Band" } : null, createdBy: r.created_by,
      mine: r.created_by === userId, canEdit: r.created_by === userId || (!!r.band_id && admin.has(r.band_id)), lineupCharts: r.lineup_can_chart !== false,
    }));
  };

  /** Uploads one file to Storage (XHR rather than supabase-js, to get upload progress). */
  const putFile = async (bucket: string, path: string, file: File, mime: string, onProgress?: (p: number) => void): Promise<void> => {
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Sign in again to upload.");
    await new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
      x.setRequestHeader("Authorization", "Bearer " + token);
      x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
      x.setRequestHeader("x-upsert", "false");
      x.setRequestHeader("Content-Type", mime);
      x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Couldn't upload ${file.name} (${x.status}).`));
      x.onerror = () => reject(new Error(`Couldn't upload ${file.name}: no connection.`));
      x.send(file);
    });
  };

  /** Uploads `file` under `dir` and records it as an attachment with `parent` ({ note_id } or { lick_id }). */
  const upload = async (dir: string, parent: { note_id: string } | { lick_id: string } | { profile_id: string } | { resource_id: string } | { band_id: string }, file: File, onProgress?: (p: number) => void): Promise<Attachment> => {
    const kind = attachmentKind(file.type, file.name);
    if (!kind) throw new Error("Only PDF, image, audio and MusicXML files can be attached.");
    const mime = mimeOf(file);
    const path = `${dir}/${newUuid()}-${safeName(file.name)}`;
    await putFile(BUCKET, path, file, mime, onProgress);
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
      const role = roles.get(row.id);
      const s = toSetlist(row, role || "viewer");
      return role ? s : { ...s, viewOnly: true };
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
        id: itemUuid(s.id, it.id), position, set_no: it.set || 1, song: it.raw, shift: it.shift ?? null, versions: it.versions || [], hits: it.hits || [], feels: it.feels || {},
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

    async searchPeople(q) {
      if (q.trim().length < 2) return [];
      const { data, error } = await sb.rpc("search_people", { q: q.trim() });
      if (error) fail("search for people", error);
      return ((data || []) as { user_id: string; display_name: string | null; instruments: string[] | null }[])
        .map(r => ({ userId: r.user_id, name: r.display_name || "Member", instruments: r.instruments || [] }));
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
      const rows = ((data || []) as NotificationRow[]).filter(r => r.payload?.setlist_id || r.payload?.band_id || r.payload?.gig_id);
      const nm = await namesOf(rows.flatMap(r => r.actor ? [r.actor] : []));
      return rows.map(r => ({
        id: r.id, kind: r.kind, setlistId: r.payload.setlist_id || null, setlistName: r.payload.setlist_name || "a setlist",
        bandId: r.payload.band_id || null, bandName: r.payload.band_name || "a band",
        gigId: r.payload.gig_id || null, gigTitle: r.payload.gig_title || "a gig",
        itemId: r.payload.item_id || null, what: r.payload.what, actorName: (r.actor && nm.get(r.actor)) || "Someone", read: !!r.read_at, createdAt: r.created_at,
      }));
    },

    async listUpdateSubs() {
      const { data, error } = await sb.from("update_subscriptions").select("gig_id, band_id").eq("user_id", userId);
      if (error) fail("load your updates", error);
      const rows = (data || []) as { gig_id: string | null; band_id: string | null }[];
      return { all: rows.some(r => !r.gig_id && !r.band_id), gigs: rows.flatMap(r => r.gig_id ? [r.gig_id] : []), bands: rows.flatMap(r => r.band_id ? [r.band_id] : []) };
    },

    async setUpdateSub({ gigId, bandId }, on) {
      if (on) {
        const { error } = await sb.from("update_subscriptions").insert({ user_id: userId, gig_id: gigId ?? null, band_id: bandId ?? null });
        if (error && error.code !== "23505") fail("turn on updates", error); // already on is fine
        return;
      }
      let q = sb.from("update_subscriptions").delete().eq("user_id", userId);
      q = gigId ? q.eq("gig_id", gigId) : q.is("gig_id", null);
      q = bandId ? q.eq("band_id", bandId) : q.is("band_id", null);
      const { error } = await q;
      if (error) fail("turn off updates", error);
    },

    async canChartSetlist(setlistId) {
      const { data, error } = await sb.rpc("can_chart_setlist", { p_setlist: setlistId });
      if (error) fail("check that setlist", error);
      return !!data;
    },

    async setItemChart(setlistId, itemId, raw) {
      const { error } = await sb.rpc("set_item_chart", { p_setlist: setlistId, p_item: itemId, p_raw: raw });
      if (error) fail("save the chart", error);
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

    async getTourSeen() {
      const { data, error } = await sb.rpc("my_profile");
      if (error) fail("check the tour", error);
      return !!((data || []) as { tour_seen: boolean | null }[])[0]?.tour_seen;
    },

    async setTourSeen() {
      const { error } = await sb.from("profiles").update({ tour_seen: true }).eq("id", userId);
      if (error) fail("save that you've seen the tour", error);
    },

    async getSettings() {
      const { data, error } = await sb.from("user_settings").select("settings").eq("user_id", userId).maybeSingle();
      if (error) fail("load your settings", error);
      return data ? normalizeSettings((data as { settings: unknown }).settings) : null;
    },

    async saveSettings(s) {
      const { error } = await sb.from("user_settings").upsert({ user_id: userId, settings: s, updated_at: new Date().toISOString() });
      if (error) fail("save your settings", error);
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
      return signedUrl(a.bucket || BUCKET, a.path, "open that file");
    },

    async listCharts(key, setlistId) {
      const or = setlistId && UUID.test(setlistId) ? `and(owner.eq.${userId},setlist_id.is.null),setlist_id.eq.${setlistId}` : `and(owner.eq.${userId},setlist_id.is.null)`;
      const { data, error } = await sb.from("charts").select(CHART_COLS).eq("song_key", key).or(or).order("created_at");
      if (error) fail("load the charts", error);
      return ((data || []) as ChartRow[]).map(toChart);
    },

    async listTuneVersions(key) {
      const [v, c] = await Promise.all([
        sb.from("tune_versions").select(VERSION_COLS).eq("song_key", key).order("created_at"),
        sb.from("tune_version_claims").select("song_key").eq("song_key", key),
      ]);
      if (v.error) fail("load the versions", v.error);
      const rows = (v.data || []) as VersionRow[];
      const nm = await namesOf(rows.flatMap(r => [r.created_by, r.checked_by]).filter((x): x is string => !!x));
      const who = (id: string | null) => id ? (id === userId ? "You" : nm.get(id) || "Member") : null;
      const versions = rows.map((r): TuneVersion => ({
        id: r.id, songKey: r.song_key, name: r.name, changes: r.changes, source: r.source, mine: r.created_by === userId,
        authorName: who(r.created_by), checkedByName: who(r.checked_by), checked: !!r.checked_by, createdAt: r.created_at,
      }));
      return { versions, aiDone: !c.error && (c.data || []).length > 0 };
    },

    async addTuneVersion(key, name, changes) {
      const { data, error } = await sb.from("tune_versions").insert({ song_key: key, name, changes, source: "community", created_by: userId }).select("id").single();
      if (error) {
        if (error.message.includes("version_limit")) throw new Error(`You can add ${VERSION_DAILY_LIMIT} versions a day. Try again tomorrow.`);
        fail("save that version", error);
      }
      return (await this.listTuneVersions(key)).versions.find(v => v.id === (data as { id: string }).id)!;
    },

    async updateTuneVersion(v, f) {
      const patch: { changes: string; name?: string } = { changes: f.changes };
      if (v.mine && f.name !== v.name) patch.name = f.name;
      const { data, error } = await sb.from("tune_versions").update(patch).eq("id", v.id).select("id");
      if (error) fail("save that version", error);
      if (!data?.length) throw new Error("Couldn't save that version: you can't change it.");
      return (await this.listTuneVersions(v.songKey)).versions.find(x => x.id === v.id) ?? v;
    },

    async checkTuneVersion(v) {
      // the database stamps who and when, whatever is sent
      const { data, error } = await sb.from("tune_versions").update({ checked_by: userId }).eq("id", v.id).eq("source", "ai").select("id");
      if (error) fail("mark that checked", error);
      if (!data?.length) throw new Error("Couldn't mark that checked.");
      return (await this.listTuneVersions(v.songKey)).versions.find(x => x.id === v.id) ?? v;
    },

    async deleteTuneVersion(v) {
      const { error } = await sb.from("tune_versions").delete().eq("id", v.id).eq("created_by", userId);
      if (error) fail("delete that version", error);
    },

    async createChart(f, file, audio, onProgress) {
      const fk = attachmentKind(file.type, file.name);
      if (fk !== "pdf" && fk !== "image" && fk !== "musicxml") throw new Error("A chart has to be a PDF, a photo or a MusicXML file.");
      if (audio && attachmentKind(audio.type, audio.name) !== "audio") throw new Error("The recording has to be an audio file.");
      const id = newUuid();
      const fileMime = mimeOf(file), audioMime = audio ? mimeOf(audio) : null;
      const filePath = `${userId}/${id}/${newUuid()}-${safeName(file.name)}`;
      const audioPath = audio ? `${userId}/${id}/${newUuid()}-${safeName(audio.name)}` : null;
      const total = file.size + (audio?.size ?? 0) || 1;
      await putFile(CHART_BUCKET, filePath, file, fileMime, p => onProgress?.(p * file.size / total));
      try {
        if (audio && audioPath && audioMime) await putFile(CHART_BUCKET, audioPath, audio, audioMime, p => onProgress?.((file.size + p * audio.size) / total));
        const { data, error } = await sb.from("charts").insert({
          id, song_key: f.songKey, setlist_id: f.setlistId, name: f.name,
          file_path: filePath, file_kind: fk, file_name: file.name.slice(0, 300), file_mime: fileMime, file_size: file.size,
          audio_path: audioPath, audio_name: audio ? audio.name.slice(0, 300) : null, audio_mime: audioMime, audio_size: audio ? audio.size : null,
        }).select(CHART_COLS).single();
        if (error) fail("save that chart", error);
        return toChart(data as ChartRow);
      } catch (e) {
        await sb.storage.from(CHART_BUCKET).remove(audioPath ? [filePath, audioPath] : [filePath]);
        throw e;
      }
    },

    async updateChart(c, f) {
      const { data, error } = await sb.from("charts").update({ name: f.name, setlist_id: f.setlistId, updated_at: new Date().toISOString() })
        .eq("id", c.id).select(CHART_COLS).single();
      if (error) fail("save that chart", error);
      return toChart(data as ChartRow);
    },

    async setChartAudio(c, audio, onProgress) {
      if (audio && attachmentKind(audio.type, audio.name) !== "audio") throw new Error("The recording has to be an audio file.");
      const old = c.audio?.path ?? null;
      const mime = audio ? mimeOf(audio) : null;
      const path = audio ? `${userId}/${c.id}/${newUuid()}-${safeName(audio.name)}` : null;
      if (audio && path && mime) await putFile(CHART_BUCKET, path, audio, mime, onProgress);
      const { data, error } = await sb.from("charts").update({
        audio_path: path, audio_name: audio ? audio.name.slice(0, 300) : null, audio_mime: mime, audio_size: audio ? audio.size : null, updated_at: new Date().toISOString(),
      }).eq("id", c.id).select(CHART_COLS).single();
      if (error) {
        if (path) await sb.storage.from(CHART_BUCKET).remove([path]);
        fail("save that recording", error);
      }
      if (old) await sb.storage.from(CHART_BUCKET).remove([old]);
      return toChart(data as ChartRow);
    },

    async deleteChart(c) {
      const rm = await sb.storage.from(CHART_BUCKET).remove(c.audio ? [c.file.path, c.audio.path] : [c.file.path]);
      if (rm.error) fail("delete that chart", rm.error);
      const { error } = await sb.from("charts").delete().eq("id", c.id);
      if (error) fail("delete that chart", error);
    },

    async listOriginals() {
      const { data, error } = await sb.from("original_songs").select(OR_COLS).eq("owner", userId).order("created_at", { ascending: false });
      if (error) fail("load your original songs", error);
      return ((data || []) as unknown as OriginalRow[]).map(r => toOriginal(r, new Map()));
    },

    async searchOriginals(q) {
      const t = q.replace(/[%_\\,()*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
      if (t.length < 2) return [];
      // RLS limits this to public songs and your bands'; yours are in your library already
      const { data, error } = await sb.from("original_songs").select(OR_COLS).neq("owner", userId)
        .or(["title", "composer"].map(c => `${c}.ilike.%${t}%`).join(",")).order("title").limit(20);
      if (error) fail("search original songs", error);
      const rows = (data || []) as unknown as OriginalRow[];
      const nm = await namesOf(rows.map(r => r.owner));
      return rows.map(r => toOriginal(r, nm));
    },

    async findOriginal(title, composer) {
      const { data, error } = await sb.from("original_songs").select(OR_COLS).eq("title", title.slice(0, 200)).eq("composer", composer.slice(0, 200))
        .order("owner", { ascending: true }).limit(5);
      if (error || !data?.length) return null;
      const rows = data as unknown as OriginalRow[];
      const r = rows.find(x => x.owner === userId) ?? rows[0];
      return toOriginal(r, await namesOf([r.owner]));
    },

    async listBandOriginals(bandId) {
      const mem = await sb.from("band_members").select("user_id").eq("band_id", bandId);
      if (mem.error) fail("load the band's originals", mem.error);
      const ids = (mem.data || []).map(r => r.user_id as string);
      if (!ids.length) return [];
      const { data, error } = await sb.from("original_songs").select(OR_COLS).in("owner", ids)
        .or(`visibility.eq.public,visibility.eq.bands,and(visibility.eq.band,band_id.eq.${bandId})`).order("title");
      if (error) fail("load the band's originals", error);
      const rows = (data || []) as unknown as OriginalRow[];
      const nm = await namesOf(rows.map(r => r.owner));
      return rows.map(r => toOriginal(r, nm));
    },

    async createOriginal(f, leadSheet, onProgress) {
      // the row first: the upload is only allowed to a path one of your rows names, so the daily cap holds
      const id = newUuid();
      let sheet: ReturnType<typeof leadSheetCols> | typeof noSheet = noSheet, mime = "";
      if (leadSheet) { mime = mimeOf(leadSheet); sheet = leadSheetCols(`${userId}/${id}/${newUuid()}-${safeName(leadSheet.name)}`, leadSheet, mime); }
      const { data, error } = await sb.from("original_songs").insert({ id, raw: f.raw, visibility: f.visibility, band_id: f.visibility === "band" ? f.bandId : null, ...sheet }).select(OR_COLS).single();
      if (error) {
        if (/new songs or lead sheets today/.test(error.message)) throw new Error(error.message);
        fail("save that song", error);
      }
      if (leadSheet && sheet.lead_sheet_path) {
        try { await putFile(LEADSHEET_BUCKET, sheet.lead_sheet_path, leadSheet, mime, onProgress); }
        catch (e) { await sb.from("original_songs").delete().eq("id", id); throw e; }
      }
      return toOriginal(data as unknown as OriginalRow, new Map());
    },

    async updateOriginal(o, f, leadSheet) {
      const patch: Record<string, unknown> = { raw: f.raw, visibility: f.visibility, band_id: f.visibility === "band" ? f.bandId : null, updated_at: new Date().toISOString() };
      let mime = "", path = "";
      if (leadSheet === "remove") Object.assign(patch, noSheet);
      else if (leadSheet) { mime = mimeOf(leadSheet); path = `${userId}/${o.id}/${newUuid()}-${safeName(leadSheet.name)}`; Object.assign(patch, leadSheetCols(path, leadSheet, mime)); }
      const { data, error } = await sb.from("original_songs").update(patch).eq("id", o.id).select(OR_COLS);
      if (error) {
        if (/new songs or lead sheets today/.test(error.message)) throw new Error(error.message);
        fail("save that song", error);
      }
      if (!data?.length) throw new Error("Couldn't save that song: you can't change it.");
      if (leadSheet instanceof File) {
        try { await putFile(LEADSHEET_BUCKET, path, leadSheet, mime); }
        catch (e) { await sb.from("original_songs").update(o.leadSheet ? { lead_sheet_path: o.leadSheet.path, lead_sheet_kind: o.leadSheet.kind, lead_sheet_name: o.leadSheet.name, lead_sheet_mime: o.leadSheet.mime, lead_sheet_size: o.leadSheet.size } : noSheet).eq("id", o.id); throw e; }
      }
      if (leadSheet && o.leadSheet) await sb.storage.from(LEADSHEET_BUCKET).remove([o.leadSheet.path]);
      return toOriginal(data[0] as unknown as OriginalRow, new Map());
    },

    async deleteOriginal(o) {
      const { data, error } = await sb.from("original_songs").delete().eq("id", o.id).select("id");
      if (error) fail("delete that song", error);
      if (!data?.length) throw new Error("Couldn't delete that song: you can't change it.");
      if (o.leadSheet) await sb.storage.from(LEADSHEET_BUCKET).remove([o.leadSheet.path]);
      if (o.recordings.length) await sb.storage.from(RECORDING_BUCKET).remove(o.recordings.map(r => r.path));
    },

    async originalLeadSheetUrl(o) {
      if (!o.leadSheet) throw new Error("This song has no lead sheet.");
      return signedUrl(LEADSHEET_BUCKET, o.leadSheet.path, "open the lead sheet");
    },

    async addOriginalRecording(o, file, onProgress) {
      if (attachmentKind(file.type, file.name) !== "audio") throw new Error("That isn't an audio file. Try an MP3, M4A or WAV.");
      if (file.size > MAX_RECORDING_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_RECORDING_MB} MB.`);
      const rec = { path: `${userId}/${o.id}/${newUuid()}-${safeName(file.name)}`, name: file.name.slice(0, 300), mime: mimeOf(file), size: file.size };
      const { error } = await sb.from("original_recordings").insert({ song_id: o.id, ...rec });
      if (error) {
        if (/new songs or lead sheets today|already has/.test(error.message)) throw new Error(error.message);
        fail("save the recording", error);
      }
      try { await putFile(RECORDING_BUCKET, rec.path, file, rec.mime, onProgress); }
      catch (e) { await sb.from("original_recordings").delete().eq("path", rec.path); throw e; }
      return { ...o, recordings: [...o.recordings, rec] };
    },

    async removeOriginalRecording(o, rec) {
      const { data, error } = await sb.from("original_recordings").delete().eq("path", rec.path).select("id");
      if (error) fail("remove the recording", error);
      if (!data?.length) throw new Error("Couldn't remove the recording: you can't change this song.");
      await sb.storage.from(RECORDING_BUCKET).remove([rec.path]);
      return { ...o, recordings: o.recordings.filter(r => r.path !== rec.path) };
    },

    async originalRecordingUrl(rec) {
      return signedUrl(RECORDING_BUCKET, rec.path, "play the recording");
    },

    async listTranscriptions(q) {
      // RLS already limits "all" to yours, public and shared with you; the filters narrow it a page at a time
      const shared = q.tab === "shared";
      let req = sb.from("transcriptions").select(shared ? TR_COLS + ", transcription_shares!inner(user_id)" : TR_COLS, { count: "exact" });
      if (shared) req = req.eq("transcription_shares.user_id", userId);
      if (q.tab === "mine") req = req.eq("owner", userId);
      if (q.instrument) req = req.eq("instrument", q.instrument);
      if (q.songKey) req = req.eq("song_key", q.songKey);
      const t = q.q.replace(/[%_\\,()*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
      if (t) req = req.or(["title", "tune_title", "player"].map(c => `${c}.ilike.%${t}%`).join(","));
      req = q.sort === "new" ? req.order("created_at", { ascending: false }) : req.order("title").order("created_at", { ascending: false });
      const from = Math.max(0, q.page) * q.perPage;
      const { data, error, count } = await req.range(from, from + q.perPage - 1);
      if (error) fail("load the transcriptions", error);
      const rows = (data || []) as unknown as TranscriptionRow[];
      const nm = await namesOf(rows.map(r => r.owner).filter(o => o !== userId));
      return { items: rows.map(r => toTranscription(r, nm)), total: count ?? rows.length };
    },

    async getTranscription(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await sb.from("transcriptions").select(TR_COLS).eq("id", id).maybeSingle();
      if (error) fail("open that transcription", error);
      if (!data) return null;
      const r = data as unknown as TranscriptionRow;
      return toTranscription(r, await namesOf([r.owner]));
    },

    async createTranscription(f, file, onProgress) {
      const fk = attachmentKind(file.type, file.name);
      if (fk !== "pdf" && fk !== "image" && fk !== "musicxml") throw new Error("A transcription has to be a PDF, a photo or a MusicXML file.");
      if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_FILE_MB} MB.`);
      // the row first: the upload is only allowed to a path one of your rows names, so the daily cap holds
      const id = newUuid(), mime = mimeOf(file), path = `${userId}/${id}/${newUuid()}-${safeName(file.name)}`;
      const { data, error } = await sb.from("transcriptions").insert({
        id, ...trFields(f), file_path: path, file_kind: fk, file_name: file.name.slice(0, 300), file_mime: mime, file_size: file.size,
      }).select(TR_COLS).single();
      if (error) {
        if (/transcriptions today/.test(error.message)) throw new Error(error.message);
        fail("save that transcription", error);
      }
      try { await putFile(TRANSCRIPTION_BUCKET, path, file, mime, onProgress); }
      catch (e) { await sb.from("transcriptions").delete().eq("id", id); throw e; }
      return toTranscription(data as unknown as TranscriptionRow, new Map());
    },

    async updateTranscription(t, f) {
      const { data, error } = await sb.from("transcriptions").update({ ...trFields(f), updated_at: new Date().toISOString() }).eq("id", t.id).select(TR_COLS);
      if (error) fail("save that transcription", error);
      if (!data?.length) throw new Error("Couldn't save that transcription: you can't change it.");
      return toTranscription(data[0] as unknown as TranscriptionRow, new Map());
    },

    async deleteTranscription(t) {
      const { data, error } = await sb.from("transcriptions").delete().eq("id", t.id).select("id");
      if (error) fail("delete that transcription", error);
      if (!data?.length) throw new Error("Couldn't delete that transcription: you can't change it.");
      await sb.storage.from(TRANSCRIPTION_BUCKET).remove([t.file.path]);
    },

    async listTranscriptionShares(id) {
      const { data, error } = await sb.rpc("transcription_share_list", { p_id: id });
      if (error) fail("load who it's shared with", error);
      return ((data || []) as { user_id: string; display_name: string | null; email: string | null }[])
        .map(m => ({ userId: m.user_id, name: m.display_name || "Member", email: m.email }));
    },

    async addTranscriptionShare(id, email) {
      const { error } = await sb.rpc("add_transcription_share", { p_id: id, p_email: email });
      if (error) {
        if (error.code === "P0002") throw new Error(MEMBER_NOT_FOUND);
        fail("share that", error);
      }
    },

    async removeTranscriptionShare(id, uid) {
      const { error } = await sb.from("transcription_shares").delete().eq("transcription_id", id).eq("user_id", uid);
      if (error) fail("remove that person", error);
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

    async listBandKitMembers(bandId) {
      const { data, error } = await sb.rpc("band_kit_members", { p_band: bandId });
      if (error) fail("load the musicians' press kits", error);
      return ((data || []) as { user_id: string; name: string | null; plays: string[] | null; bio: string | null; instruments: string[] | null; contact: Record<string, string> | null }[])
        .map(r => ({ userId: r.user_id, name: r.name || "", plays: r.plays || [], bio: r.bio || "", instruments: r.instruments || [], contact: r.contact || {} }));
    },

    async setBandKitMembers(bandId, on) {
      const { error } = await sb.from("bands").update({ kit_members: on }).eq("id", bandId);
      if (error) fail("save that", error);
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

    async listBandmateSetlists() {
      // row-level security lets through only those whose owner shares a band with you (or that you're a member of)
      const { data, error } = await sb.from("setlists").select("id, owner, name, setlist_items(id)").eq("visibility", "bands").neq("owner", userId).order("name");
      if (error) fail("load your bandmates' setlists", error);
      const rows = (data || []) as { id: string; owner: string; name: string; setlist_items: { id: string }[] | null }[];
      const nm = await namesOf(rows.map(r => r.owner));
      return rows.map(r => ({ id: r.id, name: r.name, tunes: (r.setlist_items || []).length, ownerId: r.owner, mine: false, ownerName: nm.get(r.owner) || "A bandmate" }));
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

    async listArrangements() {
      const { data, error } = await sb.from("arrangements").select(ARR_COLS).eq("owner", userId).order("created_at", { ascending: false });
      if (error) fail("load your arrangements", error);
      return ((data || []) as ArrangementRow[]).map(r => ({ id: r.id, name: r.name, raw: r.song, shift: r.shift, versions: r.versions || [], hits: r.hits || [], feels: r.feels || {}, createdAt: r.created_at }));
    },

    async saveArrangement(a: Arrangement) {
      const { error } = await sb.from("arrangements").upsert({ id: a.id, owner: userId, name: a.name, song: a.raw, shift: a.shift, versions: a.versions, hits: a.hits || [], feels: a.feels || {} });
      if (error) fail("save that arrangement", error);
    },

    async deleteArrangement(id) {
      const { error } = await sb.from("arrangements").delete().eq("id", id);
      if (error) fail("remove that arrangement", error);
    },

    async listPracticeTracks() {
      const { data, error } = await sb.from("practice_tracks").select("id, name, mime, size, created_at").eq("owner", userId).order("created_at");
      if (error) fail("load your recordings", error);
      return ((data || []) as { id: string; name: string; mime: string; size: number; created_at: string }[]).map(r => ({ id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at }));
    },

    async addPracticeTrack(file, onProgress) {
      const mime = mimeOf(file);
      const ok = /^(audio|video)\//.test(mime) ? mime : attachmentKind(file.type, file.name) === "audio" ? "audio/mpeg" : "";
      if (!ok) throw new Error("That isn't an audio file.");
      if (file.size > MAX_PRACTICE_BYTES) throw new Error("That file is over 25 MB.");
      // the row first: the upload is only allowed to a path one of your rows names, so the cap of 3 holds
      const id = newUuid(), path = `${userId}/${id}/${newUuid()}-${safeName(file.name)}`;
      const { data, error } = await sb.from("practice_tracks").insert({ id, name: file.name.slice(0, 300), storage_path: path, mime: ok, size: file.size })
        .select("id, name, mime, size, created_at").single();
      if (error) {
        if (/3 recordings|10 uploads/.test(error.message)) throw new Error(error.message);
        fail("save that recording", error);
      }
      try { await putFile(PRACTICE_BUCKET, path, file, ok, onProgress); }
      catch (e) { await sb.from("practice_tracks").delete().eq("id", id); throw e; }
      const r = data as { id: string; name: string; mime: string; size: number; created_at: string };
      return { id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at };
    },

    async deletePracticeTrack(t) {
      const { data } = await sb.from("practice_tracks").select("storage_path").eq("id", t.id).maybeSingle();
      const { error } = await sb.from("practice_tracks").delete().eq("id", t.id);
      if (error) fail("delete that recording", error);
      if (data?.storage_path) await sb.storage.from(PRACTICE_BUCKET).remove([data.storage_path as string]);
    },

    async practiceTrackUrl(t) {
      const { data: row, error: e1 } = await sb.from("practice_tracks").select("storage_path").eq("id", t.id).single();
      if (e1) fail("find that recording", e1);
      const { data, error } = await sb.storage.from(PRACTICE_BUCKET).createSignedUrl((row as { storage_path: string }).storage_path, 3600);
      if (error || !data) fail("open that recording", error);
      return data.signedUrl;
    },

    async listGigs() {
      const { data, error } = await sb.from("gigs").select(GIG_COLS).order("gig_date").order("start_time", { nullsFirst: true });
      if (error) fail("load your gigs", error);
      return toGigs((data || []) as unknown as GigRow[]);
    },

    async getGig(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await sb.from("gigs").select(GIG_COLS).eq("id", id).maybeSingle();
      if (error) fail("open that gig", error);
      return data ? (await toGigs([data as unknown as GigRow]))[0] : null;
    },

    async createGig(f) {
      const { data, error } = await sb.from("gigs").insert(gigCols(f)).select(GIG_COLS).single();
      if (error) fail("save that gig", error);
      return (await toGigs([data as unknown as GigRow]))[0];
    },

    async updateGig(id, f) {
      const { data, error } = await sb.from("gigs").update(gigCols(f)).eq("id", id).select("id");
      if (error) fail("save that gig", error);
      if (!data?.length) throw new Error("Couldn't save that gig: you can't change it.");
    },

    async deleteGig(id) {
      const { data, error } = await sb.from("gigs").delete().eq("id", id).select("id");
      if (error) fail("delete that gig", error);
      if (!data?.length) throw new Error("Couldn't delete that gig: you can't change it.");
    },

    async listGigSetlists(gigId) {
      const { data, error } = await sb.from("gig_setlists").select("setlist_id, position").eq("gig_id", gigId).order("position");
      if (error) fail("load the gig's setlists", error);
      const rows = (data || []) as { setlist_id: string; position: number }[];
      if (!rows.length) return [];
      const sl = await sb.from("setlists").select("id, owner, name, setlist_items(id)").in("id", rows.map(r => r.setlist_id));
      if (sl.error) fail("load the gig's setlists", sl.error);
      const by = new Map(((sl.data || []) as { id: string; owner: string; name: string; setlist_items: { id: string }[] | null }[]).map(r => [r.id, r]));
      const nm = await namesOf([...by.values()].map(r => r.owner));
      return rows.flatMap(r => {
        const s = by.get(r.setlist_id);
        return s ? [{ id: s.id, name: s.name, tunes: (s.setlist_items || []).length, mine: s.owner === userId, ownerName: s.owner === userId ? "You" : nm.get(s.owner) || "Member" }] : [];
      });
    },

    async addGigSetlist(gigId, setlistId) {
      const { data: last } = await sb.from("gig_setlists").select("position").eq("gig_id", gigId).order("position", { ascending: false }).limit(1);
      const position = ((last?.[0] as { position: number } | undefined)?.position ?? -1) + 1;
      const { error } = await sb.from("gig_setlists").insert({ gig_id: gigId, setlist_id: setlistId, position });
      if (error?.code === "23505") throw new Error("That setlist is already on this gig.");
      if (error) fail("add that setlist", error);
    },

    async removeGigSetlist(gigId, setlistId) {
      const { error } = await sb.from("gig_setlists").delete().eq("gig_id", gigId).eq("setlist_id", setlistId);
      if (error) fail("take that setlist off the gig", error);
    },

    async swapGigSetlist(gigId, oldId, newId) {
      const { data, error } = await sb.from("gig_setlists").update({ setlist_id: newId }).eq("gig_id", gigId).eq("setlist_id", oldId).select("gig_id");
      if (error) fail("switch to your copy", error);
      if (!data?.length) throw new Error("Couldn't switch to your copy: you can't change this gig.");
    },

    async listGigsOfSetlist(setlistId) {
      const { data, error } = await sb.from("gig_setlists").select("gigs(id, title, gig_date)").eq("setlist_id", setlistId);
      if (error) fail("load the gigs", error);
      return ((data || []) as unknown as { gigs: { id: string; title: string; gig_date: string } | null }[])
        .flatMap(r => r.gigs ? [{ id: r.gigs.id, title: r.gigs.title, date: r.gigs.gig_date }] : [])
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async listBandGigs(bandId) {
      const { data, error } = await sb.from("gigs").select(GIG_COLS).eq("band_id", bandId).order("gig_date").order("start_time", { nullsFirst: true });
      if (error) fail("load the band's gigs", error);
      return toGigs((data || []) as unknown as GigRow[]);
    },

    async listGigLineup(gigId) {
      const { data, error } = await sb.rpc("gig_lineup_list", { p_gig: gigId });
      if (error) fail("load the lineup", error);
      return ((data || []) as { id: string; user_id: string | null; name: string; plays: string; contact: Record<string, string> | null }[])
        .map((r): GigPerson => ({ id: r.id, userId: r.user_id, name: r.name, plays: r.plays || "", contact: r.contact || {} }));
    },

    async addGigPerson(gigId, f) {
      const row: Record<string, string> = f.userId
        ? { gig_id: gigId, user_id: f.userId, plays: f.plays.trim() }
        : { gig_id: gigId, guest_name: (f.name || "").trim(), plays: f.plays.trim(), guest_phone: (f.phone || "").trim(), guest_email: (f.email || "").trim() };
      const { error } = await sb.from("gig_lineup").insert(row);
      if (error?.code === "23505") throw new Error("That person is already on the lineup.");
      if (error) fail("add that person", error);
    },

    async updateGigPerson(_gigId, p, f) {
      const patch = p.userId ? { plays: f.plays.trim() }
        : { plays: f.plays.trim(), guest_name: (f.name || "").trim(), guest_phone: (f.phone || "").trim(), guest_email: (f.email || "").trim() };
      const { data, error } = await sb.from("gig_lineup").update(patch).eq("id", p.id).select("id");
      if (error) fail("save that person", error);
      if (!data?.length) throw new Error("Couldn't save that person: you can't change this gig.");
    },

    async removeGigPerson(personId) {
      const { error } = await sb.from("gig_lineup").delete().eq("id", personId);
      if (error) fail("remove that person", error);
    },

    async listGigPhotos(gigId) {
      const { data, error } = await sb.rpc("gig_photos", { p_gig: gigId });
      if (error) fail("load the photos", error);
      return ((data || []) as { id: string; source: "band" | "member"; owner_name: string | null; storage_path: string; name: string; mime: string }[]).map((r): GigPhoto => ({
        id: r.id, source: r.source, ownerName: r.owner_name || "Member",
        attachment: { id: r.id, noteId: null, lickId: null, resourceId: null, path: r.storage_path, kind: "image", name: r.name, mime: r.mime, size: 0, createdBy: "", createdAt: "" },
      }));
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

    async getSharedPlaylist(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await sb.from("library_playlists").select("id, name, songs, owner, visibility").eq("id", id).maybeSingle();
      if (error) fail("open that playlist", error);
      if (!data) return null;
      const r = data as PlaylistRow & { owner: string; visibility: Visibility };
      const nm = await namesOf([r.owner]);
      return { id: r.id, name: r.name, songs: r.songs || [], ownerName: nm.get(r.owner) || "A musician", mine: r.owner === userId, visibility: r.visibility };
    },

    async setLibraryVisibility(id, visibility) {
      const { data, error } = await sb.from("library_playlists").update({ visibility }).eq("id", id).eq("owner", userId).select("id");
      if (error) fail("share that playlist", error);
      if (!data?.length) throw new Error("Couldn't share that playlist: it isn't yours.");
    },

    async deleteLibraryPlaylist(id) {
      const { error } = await sb.from("library_playlists").delete().eq("id", id);
      if (error) fail("remove that playlist", error);
    },
  };
}
