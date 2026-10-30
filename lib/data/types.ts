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

export interface LibraryPlaylist { id: string; name: string; songs: string[] }

export interface DataStore {
  readonly kind: "local" | "supabase";
  /** A fresh id for a new setlist or playlist (slug locally, UUID in Supabase). */
  newId(name: string, taken: (id: string) => boolean): string;
  listSetlists(): Promise<Setlist[]>;
  /** A setlist you don't own but can open (shared with you, or by link). Null when not found or not allowed. */
  getSetlist(id: string): Promise<Setlist | null>;
  saveSetlist(s: Setlist): Promise<void>;
  deleteSetlist(id: string): Promise<void>;
  listLibrary(): Promise<LibraryPlaylist[]>;
  saveLibraryPlaylist(p: LibraryPlaylist): Promise<void>;
  deleteLibraryPlaylist(id: string): Promise<void>;
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set";
