// The app's data model and the one interface both storage adapters implement.

export interface Version { uri: string; name: string; artists: string }

export interface SetlistItem {
  id: string;
  /** The iReal Pro song string, exactly as imported. */
  raw: string;
  set: 1 | 2;
  /** Semitones from the chart's written key; null = use iReal's own transpose setting. */
  shift: number | null;
  versions: Version[];
  /** Legacy single note; notes now live in the notes table (R5). Read only, never written. */
  note?: string | null;
}

export type Visibility = "private" | "link" | "public";
export type Role = "owner" | "editor" | "viewer";

export interface Setlist {
  id: string;
  name: string;
  /** spotify:playlist:… / spotify:album:… / spotify:track:… */
  spotify: string | null;
  items: SetlistItem[];
  visibility?: Visibility;
  /** Your role on this setlist (accounts only). Local setlists are always yours. */
  role?: Role;
  /** The band it's shared with (accounts only). */
  band?: { id: string; name: string } | null;
}

export interface Member {
  userId: string;
  name: string;
  /** Only the owner sees emails. */
  email: string | null;
  role: "viewer" | "editor";
}

export const MEMBER_NOT_FOUND = "No Niu Real Book account for that email";

export const NOTE_TAGS = ["intro", "ending", "arrangement", "solo", "form", "practice", "general"] as const;
export type NoteTag = typeof NOTE_TAGS[number];

/** Where a note lives: a setlist, a tune in a setlist, or the author's own song notes (key: `songKey()` in lib/songs.ts). */
export type NoteHome =
  | { kind: "setlist"; setlistId: string }
  | { kind: "item"; setlistId: string; itemId: string }
  | { kind: "song"; songKey: string }
  | { kind: "band"; bandId: string };

export interface Note {
  id: string;
  authorId: string;
  authorName: string;
  /** Set on replies (one level only). */
  parentId: string | null;
  tag: NoteTag | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind = "added_to_setlist" | "note_on_setlist" | "reply_to_note" | "added_to_band" | "note_in_band";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Setlist notifications. */
  setlistId: string | null;
  setlistName: string;
  /** Band notifications. */
  bandId: string | null;
  bandName: string;
  /** Setlist item (a tune) the note is on, when it's on a tune. */
  itemId: string | null;
  actorName: string;
  read: boolean;
  createdAt: string;
}

export type AttachmentKind = "pdf" | "image" | "audio";

/** A file on a note (R6). Accounts only; local mode has no attachments. */
export interface Attachment {
  id: string;
  /** The note it's on, or null for a lick's or profile file. */
  noteId: string | null;
  lickId: string | null;
  /** Set on promo files (R11). */
  profileId?: string | null;
  /** Set on a band's press kit files (R10). */
  bandId?: string | null;
  resourceId: string | null;
  path: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  createdBy: string;
  createdAt: string;
}

/** pdf / image / audio from the mime type, falling back to the file extension; null for anything else. */
export function attachmentKind(mime: string, name: string): AttachmentKind | null {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) return "image";
  if (["mp3", "m4a", "wav", "webm", "aac", "ogg", "oga", "caf"].includes(ext)) return "audio";
  return null;
}

/** Who can see a profile field: only you, the bands you're in, or anyone with your public page (R11). */
export type Share = "private" | "bands" | "public";
export const SHARES: { value: Share; label: string }[] = [
  { value: "private", label: "Only me" }, { value: "bands", label: "My bands" }, { value: "public", label: "Public" },
];

/** Contact fields, in display order. `kind` picks the input type and how the public page links them. */
export const CONTACT_FIELDS = [
  { key: "phone", label: "Phone", kind: "tel" }, { key: "email", label: "Email", kind: "email" }, { key: "whatsapp", label: "WhatsApp", kind: "tel" },
  { key: "website", label: "Website", kind: "url" }, { key: "instagram", label: "Instagram", kind: "url" }, { key: "tiktok", label: "TikTok", kind: "url" },
  { key: "youtube", label: "YouTube", kind: "url" }, { key: "facebook", label: "Facebook", kind: "url" }, { key: "spotify", label: "Spotify", kind: "url" },
  { key: "bandcamp", label: "Bandcamp", kind: "url" }, { key: "soundcloud", label: "SoundCloud", kind: "url" },
  { key: "payment", label: "Payment link (Revolut, PayPal.me…)", kind: "url" },
] as const;

/** The share key of a promo file; other keys are the contact keys plus "bio" and "instruments". */
export const fileShareKey = (id: string): string => "file:" + id;

/** Your own profile and press kit (R11). Accounts only. */
export interface Profile {
  displayName: string;
  bio: string;
  instruments: string[];
  contact: Record<string, string>;
  share: Record<string, Share>;
  /** The public page is /epk/<slug>; null = no public page. */
  epkSlug: string | null;
}

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

/** What a band member may do. Admins may do all of it. */
export const BAND_PERMS = [
  { key: "notes", label: "Post band notes and setlist notes" },
  { key: "edit_setlists", label: "Change tunes, order and keys of band setlists" },
  { key: "add_setlists", label: "Add their own setlists to the band" },
  { key: "invite", label: "Invite people" },
] as const;
export type BandPerm = typeof BAND_PERMS[number]["key"];
export type BandPerms = Record<BandPerm, boolean>;
export const DEFAULT_BAND_PERMS: BandPerms = { notes: true, edit_setlists: false, add_setlists: false, invite: false };
export const ALL_BAND_PERMS: BandPerms = { notes: true, edit_setlists: true, add_setlists: true, invite: true };

export type BandRole = "admin" | "member";

/** A member's permissions: everything for admins, else their own settings over the band's defaults. */
export const effectivePerms = (role: BandRole, own: Partial<BandPerms> | null, def: BandPerms): BandPerms =>
  role === "admin" ? ALL_BAND_PERMS : { ...def, ...(own || {}) };

/** A band you're in (accounts only). */
export interface Band {
  id: string;
  name: string;
  role: BandRole;
  defaultPerms: BandPerms;
  /** Your own permissions here. */
  perms: BandPerms;
  /** What you play in this band. */
  plays: string[];
  bio: string;
  /** The band's links (same keys as `CONTACT_FIELDS`). */
  contact: Record<string, string>;
  /** The public page is /epk/<slug>; null = no public page. */
  epkSlug: string | null;
}

export interface BandFields { name: string; defaultPerms: BandPerms; bio: string; contact: Record<string, string>; epkSlug: string | null }

export interface BandMember {
  userId: string;
  name: string;
  role: BandRole;
  plays: string[];
  /** Per-person settings; null = the band defaults. */
  perms: Partial<BandPerms> | null;
  effective: BandPerms;
  /** What they share with this band. */
  bio: string;
  instruments: string[];
  contact: Record<string, string>;
}

/** Someone you can add to a band. Instruments are only known if they share them with bands. */
export interface BandCandidate { userId: string; name: string; instruments: string[] }

/** A setlist shared with a band. */
export interface BandSetlist { id: string; name: string; tunes: number; ownerId: string; ownerName: string; mine: boolean }

/** Per-field choices for what one band sees of your profile: true = shown, false = hidden, missing = your account-wide choice. */
export type BandShare = Record<string, boolean>;

/** Is a profile field shown to bands by your account-wide settings? */
export const sharedWithBands = (share: Record<string, Share>, key: string): boolean => share[key] === "bands" || share[key] === "public";

/** A snippet in the owner's library (R8). Visible to its owner and to members of setlists it's linked into. */
export interface Lick {
  id: string;
  ownerId: string;
  ownerName: string;
  mine: boolean;
  title: string;
  body: string;
  tags: string[];
  /** Chords it sits over in iReal-style symbols ("Dm7 G7 | Cmaj7"), "" for none (R8.4). */
  progression: string;
  /** The key the progression is written in ("F"); "" means C. */
  key: string;
  /** The line itself in ABC notation ("K:F\n\"Gm7\"z B d f …"), "" for none. */
  notation: string;
  createdAt: string;
  updatedAt: string;
}

/** A lick attached to a tune of a setlist, or to your own notes on a song. */
export type LickHome = Extract<NoteHome, { kind: "item" | "song" }>;

export interface LickLink { id: string; lick: Lick; createdBy: string }

export interface LickFields { title: string; body: string; tags: string[]; progression: string; key: string; notation: string }

/** Comma-separated tags to a clean list: trimmed, lowercase, no repeats, at most 20. */
export const parseTags = (s: string): string[] =>
  [...new Set(s.split(",").map(t => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 20);

/** A bookmark or an uploaded book/PDF in your own Resources (R12). Private to you. */
export interface Resource {
  id: string;
  kind: "link" | "file";
  title: string;
  /** Links only. */
  url: string;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceFields { kind: Resource["kind"]; title: string; url: string; tags: string[]; note: string }

export interface ResourceLink { id: string; resource: Resource }

export interface LibraryPlaylist { id: string; name: string; songs: string[] }

/** A fresh id for a setlist item (a UUID, so Supabase keeps it). */
export const newItemId = (): string => crypto.randomUUID();

export interface DataStore {
  readonly kind: "local" | "supabase";
  /** A fresh id for a new setlist or playlist (slug locally, UUID in Supabase). */
  newId(name: string, taken: (id: string) => boolean): string;
  listSetlists(): Promise<Setlist[]>;
  /** A setlist you don't own but can open (shared with you, or by link). Null when not found or not allowed. */
  getSetlist(id: string): Promise<Setlist | null>;
  saveSetlist(s: Setlist): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  /** Setlist members (accounts only; local mode has none). */
  listMembers(setlistId: string): Promise<Member[]>;
  /** Owner only. Throws Error(MEMBER_NOT_FOUND) when no account has that email. */
  addMember(setlistId: string, email: string, role: Member["role"]): Promise<void>;
  setMemberRole(setlistId: string, userId: string, role: Member["role"]): Promise<void>;
  removeMember(setlistId: string, userId: string): Promise<void>;
  leaveSetlist(setlistId: string): Promise<void>;
  /** Notes and replies at a home, oldest first. Personal (song) notes are only ever yours. */
  listNotes(home: NoteHome): Promise<Note[]>;
  /** Notes and replies per tune of a setlist, keyed by the given item ids. */
  countNotes(setlistId: string, itemIds: string[]): Promise<Record<string, number>>;
  /** Any member (viewers too) can add notes to a setlist home; replies take their parent's home. */
  addNote(home: NoteHome, n: { body: string; tag?: NoteTag | null; parentId?: string | null }): Promise<Note>;
  /** Author only. */
  updateNote(id: string, n: { body: string; tag?: NoteTag | null }): Promise<void>;
  /** Author, or the setlist owner for setlist homes. Deletes the replies too. */
  deleteNote(id: string): Promise<void>;
  /** Independent copy of a note (no replies) into another home, authored by you. */
  copyNote(noteId: string, to: NoteHome): Promise<void>;
  /** Your 50 newest notifications (accounts only; local mode has none). */
  listNotifications(): Promise<AppNotification[]>;
  /** Mark the given notifications read, or all of yours when no ids are given. */
  markNotificationsRead(ids?: string[]): Promise<void>;
  /** Files on the given notes. Empty in local mode. */
  listAttachments(noteIds: string[]): Promise<Attachment[]>;
  /** Uploads a file to a note you can write to (accounts only). Progress is 0..1. */
  uploadAttachment(home: NoteHome, noteId: string, file: File, onProgress?: (p: number) => void): Promise<Attachment>;
  /** Uploader, or the setlist owner. Removes the file too. */
  deleteAttachment(a: Attachment): Promise<void>;
  /** A short-lived URL to read the file. */
  attachmentUrl(a: Attachment): Promise<string>;
  /** The PDF/image you picked as the chart for a tune, if any (R3.4). */
  getChartChoice(setlistId: string, itemId: string): Promise<Attachment | null>;
  setChartChoice(setlistId: string, itemId: string, attachmentId: string | null): Promise<void>;
  /** Your profile and press kit (accounts only). */
  getMyProfile(): Promise<Profile>;
  updateMyProfile(p: Profile): Promise<void>;
  /** Promo files, oldest first. */
  listProfileFiles(): Promise<Attachment[]>;
  uploadProfileFile(file: File, onProgress?: (p: number) => void): Promise<Attachment>;
  /** Your own licks, newest first (accounts only; local mode has none). */
  listLicks(): Promise<Lick[]>;
  /** One lick you can read (yours, or linked into a setlist you're in). Null when not found. */
  getLick(id: string): Promise<Lick | null>;
  createLick(f: LickFields): Promise<Lick>;
  /** Owner only. */
  updateLick(id: string, f: LickFields): Promise<void>;
  /** Owner only. Removes its links and files too. */
  deleteLick(id: string): Promise<void>;
  /** Licks attached at a home that you can see. */
  listLickLinks(home: LickHome): Promise<LickLink[]>;
  /** Attach one of your licks. Needs membership of the setlist. */
  linkLick(lickId: string, home: LickHome): Promise<LickLink>;
  /** The linker, or the setlist owner. */
  unlinkLick(linkId: string): Promise<void>;
  /** A private copy (with its files) of a lick you can see. */
  copyLick(lickId: string): Promise<Lick>;
  listLickAttachments(lickIds: string[]): Promise<Attachment[]>;
  /** Owner only. Progress is 0..1. */
  uploadLickAttachment(lickId: string, file: File, onProgress?: (p: number) => void): Promise<Attachment>;
  /** Your resources, newest first (accounts only; local mode has none). */
  listResources(): Promise<Resource[]>;
  createResource(f: ResourceFields): Promise<Resource>;
  updateResource(id: string, f: ResourceFields): Promise<void>;
  /** Removes its links and files too. */
  deleteResource(id: string): Promise<void>;
  /** Progress is 0..1. */
  uploadResourceFile(resourceId: string, file: File, onProgress?: (p: number) => void): Promise<Attachment>;
  listResourceFiles(resourceIds: string[]): Promise<Attachment[]>;
  /** Your resources pinned to a song (key: `songKey()`). */
  listResourceLinks(songKey: string): Promise<ResourceLink[]>;
  linkResource(id: string, songKey: string): Promise<ResourceLink>;
  unlinkResource(linkId: string): Promise<void>;
  /** Bands you're in (accounts only; local mode has none). */
  listBands(): Promise<Band[]>;
  getBand(id: string): Promise<Band | null>;
  /** You become its admin. */
  createBand(name: string, defaultPerms: BandPerms): Promise<Band>;
  /** Admins only. */
  updateBand(id: string, f: BandFields): Promise<void>;
  /** Admins only. Setlists stay with their owners; band notes and files go. */
  deleteBand(id: string): Promise<void>;
  listBandMembers(bandId: string): Promise<BandMember[]>;
  /** Needs the invite permission. Email exactly, or part of a display name. */
  searchBandUsers(bandId: string, q: string): Promise<BandCandidate[]>;
  addBandMember(bandId: string, userId: string, plays: string[]): Promise<void>;
  /** A link token (needs the invite permission). */
  createBandInvite(bandId: string): Promise<string>;
  /** Admins only: switches off every open link. */
  revokeBandInvites(bandId: string): Promise<void>;
  /** The band a link is for, or null when it's expired or switched off. */
  bandInviteInfo(token: string): Promise<{ bandId: string; name: string } | null>;
  acceptBandInvite(token: string, plays: string[]): Promise<string>;
  /** Admins only. perms null = the band defaults. */
  setBandMember(bandId: string, userId: string, role: BandRole, perms: Partial<BandPerms> | null): Promise<void>;
  removeBandMember(bandId: string, userId: string): Promise<void>;
  leaveBand(bandId: string): Promise<void>;
  setBandPlays(bandId: string, plays: string[]): Promise<void>;
  /** Your choices for this band; null = not confirmed yet. */
  getBandShare(bandId: string): Promise<BandShare | null>;
  setBandShare(bandId: string, share: BandShare): Promise<void>;
  listBandSetlists(bandId: string): Promise<BandSetlist[]>;
  /** Owner only: share a setlist with a band you can add setlists to, or null to take it out. */
  setSetlistBand(setlistId: string, bandId: string | null): Promise<void>;
  /** The band's press kit files, oldest first. */
  listBandFiles(bandId: string): Promise<Attachment[]>;
  /** Admins only. Progress is 0..1. */
  uploadBandFile(bandId: string, file: File, onProgress?: (p: number) => void): Promise<Attachment>;
  listLibrary(): Promise<LibraryPlaylist[]>;
  saveLibraryPlaylist(p: LibraryPlaylist): Promise<void>;
  deleteLibraryPlaylist(id: string): Promise<void>;
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set";
