// Fake musicians and the data scripts/seed.ts creates for them. Fixed ids so tests can name rows directly.
// Local Supabase only: the passwords below are public on purpose.
import standards from "../data/library/essential-standards.json";

const id = (kind: number, n: number) => `${kind.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const PASSWORD = "gigbook-fake-pw-1";

export type Who = "ava" | "ben" | "cleo" | "dev" | "eli" | "fay";
export interface FakeUser {
  key: Who; id: string; email: string; name: string; instruments: string[];
  contact: Record<string, string>; share: Record<string, string>; epkSlug: string | null; bio: string;
}

const user = (key: Who, n: number, name: string, instruments: string[], extra: Partial<FakeUser> = {}): FakeUser => ({
  key, id: id(0xa0, n), email: `${key}@gigbook.test`, name, instruments, contact: {}, share: {}, epkSlug: null,
  bio: `${name} plays ${instruments.join(" and ").toLowerCase()}.`, ...extra,
});

export const USERS: Record<Who, FakeUser> = {
  ava: user("ava", 1, "Ava", ["Piano", "Vocals"], {
    contact: { phone: "+353 1 555 0101", email: "ava@example.test", website: "https://ava.example.test" },
    share: { instruments: "public", bio: "public", phone: "private", email: "bands", website: "public" }, epkSlug: "ava-music",
  }),
  ben: user("ben", 2, "Ben", ["Bass"], { contact: { phone: "+353 1 555 0102" }, share: { instruments: "bands", phone: "bands" } }),
  cleo: user("cleo", 3, "Cleo", ["Drums"], { contact: { phone: "+353 1 555 0103" }, share: { phone: "private" } }),
  dev: user("dev", 4, "Dev", ["Tenor sax"], { contact: { email: "dev@example.test" }, share: { email: "public", instruments: "public" }, epkSlug: "dev-sax" }),
  eli: user("eli", 5, "Eli", ["Guitar"]),
  fay: user("fay", 6, "Fay", ["Trumpet"], { contact: { phone: "+353 1 555 0106" }, share: { phone: "bands" } }),
};
export const WHO = Object.keys(USERS) as Who[];

/** Jazz Essentials charts by index (raw iReal strings). */
export const tunes = (...i: number[]): string[] => i.map(n => (standards as string[])[n]);

export const IDS = {
  // setlists
  avaSet: id(0xb0, 1), avaSolo: id(0xb0, 2), benSet: id(0xb0, 3), cleoSet: id(0xb0, 4), devSet: id(0xb0, 5), eliSet: id(0xb0, 6), faySet: id(0xb0, 7),
  avaTrioSet: id(0xb0, 8), devQuartetSet: id(0xb0, 9),
  // bands
  avaTrio: id(0xc0, 1), devQuartet: id(0xc0, 2),
  // licks and resources
  avaLick: id(0xd0, 1), benLick: id(0xd0, 2), cleoLick: id(0xd0, 3), devLick: id(0xd0, 4), eliLick: id(0xd0, 5), fayLick: id(0xd0, 6),
  avaRes: id(0xe0, 1), avaPdfRes: id(0xe0, 2), eliRes: id(0xe0, 3),
  // notes
  avaSetNote: id(0xf0, 1), avaSetReply: id(0xf0, 2), avaTrioBandNote: id(0xf0, 3), devBandNote: id(0xf0, 4), avaPrivateNote: id(0xf0, 5), benPrivateNote: id(0xf0, 6),
  // attachments, lick links
  avaLickLink: id(0x90, 1), avaPrivateNoteFile: id(0x90, 2), avaTrioNoteFile: id(0x90, 3), avaResFile: id(0x90, 4), avaLickFile: id(0x90, 5), avaTrioKitFile: id(0x90, 6),
  // invites
  avaTrioInvite: id(0x80, 1), avaTrioExpired: id(0x80, 2),
};

export const INVITES = { avaTrio: "seedinvite" + "a".repeat(22), avaTrioExpired: "seedexpired" + "b".repeat(21) };

/** Tunes the seeded setlists contain. */
export const SET_TUNES: Record<string, string[]> = {
  [IDS.avaSet]: tunes(0, 1, 2, 3), [IDS.avaSolo]: tunes(4, 5), [IDS.benSet]: tunes(6, 7), [IDS.cleoSet]: tunes(8, 9),
  [IDS.devSet]: tunes(10, 11), [IDS.eliSet]: tunes(12, 13), [IDS.faySet]: tunes(14, 15), [IDS.avaTrioSet]: tunes(16, 17, 18), [IDS.devQuartetSet]: tunes(19, 20),
};

/** Storage paths of the files the seed uploads (so a re-run can delete them). */
export const FILES = {
  avaPrivateNote: `user/${USERS.ava.id}/${IDS.avaPrivateNote}/chart.pdf`,
  avaTrioNote: `band/${IDS.avaTrio}/${IDS.avaTrioBandNote}/band-chart.pdf`,
  avaRes: `user/${USERS.ava.id}/resources/${IDS.avaPdfRes}/changes.pdf`,
  avaLick: `user/${USERS.ava.id}/licks/${IDS.avaLick}/line.pdf`,
  avaTrioKit: `band/${IDS.avaTrio}/kit/stage-plot.pdf`,
};

/** A tiny PDF. */
export const TINY_PDF = "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
