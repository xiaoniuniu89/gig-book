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
}

export interface Member {
  userId: string;
  name: string;
  /** Only the owner sees emails. */
  email: string | null;
  role: "viewer" | "editor";
}

export const MEMBER_NOT_FOUND = "No Gig Book account for that email";

export const NOTE_TAGS = ["intro", "ending", "arrangement", "solo", "form", "practice", "general"] as const;
export type NoteTag = typeof NOTE_TAGS[number];

/** Where a note lives: a setlist, a tune in a setlist, or the author's own song notes (key: `songKey()` in lib/songs.ts). */
export type NoteHome =
  | { kind: "setlist"; setlistId: string }
  | { kind: "item"; setlistId: string; itemId: string }
  | { kind: "song"; songKey: string };

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

export type NotificationKind = "added_to_setlist" | "note_on_setlist" | "reply_to_note";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  setlistId: string;
  setlistName: string;
  /** Setlist item (a tune) the note is on, when it's on a tune. */
  itemId: string | null;
  actorName: string;
  read: boolean;
  createdAt: string;
}

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
  listLibrary(): Promise<LibraryPlaylist[]>;
  saveLibraryPlaylist(p: LibraryPlaylist): Promise<void>;
  deleteLibraryPlaylist(id: string): Promise<void>;
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set";
