// Fake musicians for the tests and the dev project (npm run seed / npm run seed:dev). Local Supabase or the dev project only: uses the service role key and wipes + recreates
// the fixture users (tests/fixtures.ts) and everything they own. Safe to run again.
import { createClient } from "@supabase/supabase-js";
import { SB_URL, SERVICE_KEY, assertSeedTarget } from "../tests/env";
import { FILES, IDS, INVITES, PASSWORD, SET_TUNES, TINY_PDF, USERS, WHO } from "../tests/fixtures";
import { songKey } from "../lib/songs";
import { STARTER_LICKS } from "../lib/starterLicks";

assertSeedTarget();
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// rows with different columns: leave missing ones to the column defaults instead of sending null
const ins = (table: string, rows: object[]) => sb.from(table).insert(rows, { defaultToNull: false });

function ok<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`seed: ${what}: ${r.error.message}`);
  return r.data;
}

async function wipe() {
  // storage first (rows go with the users, files don't)
  await sb.storage.from("attachments").remove(Object.values(FILES));
  const emails = new Set(WHO.map(w => USERS[w].email));
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email && emails.has(u.email)) { const d = await sb.auth.admin.deleteUser(u.id); if (d.error) throw d.error; }
    if (data.users.length < 200) break;
  }
}

async function main() {
  await wipe();

  // ---- users and profiles
  for (const w of WHO) {
    const u = USERS[w];
    // the id is fixed so tests can name rows
    const made = await sb.auth.admin.createUser({ id: u.id, email: u.email, password: PASSWORD, email_confirm: true } as Parameters<typeof sb.auth.admin.createUser>[0]);
    if (made.error) throw made.error;
    ok("profile " + w, await sb.from("profiles").update({
      display_name: u.name, bio: u.bio, instruments: u.instruments, contact: u.contact, share: u.share, epk_slug: u.epkSlug,
    }).eq("id", u.id));
  }

  // ---- bands: Ava Trio (Ava admin; Ben with edit_setlists; Cleo defaults) and Dev Quartet (Dev + Ava admins; Ben, Fay)
  ok("bands", await ins("bands", [
    { id: IDS.avaTrio, name: "Ava Trio", created_by: USERS.ava.id, bio: "A piano trio.", contact: { email: "trio@example.test" } },
    { id: IDS.devQuartet, name: "Dev Quartet", created_by: USERS.dev.id },
  ]));
  const member = (band: string, who: keyof typeof USERS, role: "admin" | "member", perms: object | null = null, plays: string[] = []) =>
    ({ band_id: band, user_id: USERS[who].id, role, perms, plays, share: {} });
  ok("band members", await sb.from("band_members").insert([
    member(IDS.avaTrio, "ava", "admin", null, ["Piano"]),
    member(IDS.avaTrio, "ben", "member", { edit_setlists: true }, ["Bass"]),
    member(IDS.avaTrio, "cleo", "member", null, ["Drums"]),
    member(IDS.devQuartet, "dev", "admin", null, ["Tenor sax"]),
    member(IDS.devQuartet, "ava", "admin", null, ["Piano"]),
    member(IDS.devQuartet, "ben", "member", null, ["Bass"]),
    member(IDS.devQuartet, "fay", "member", null, ["Trumpet"]),
  ]));
  ok("invites", await ins("band_invites", [
    { id: IDS.avaTrioInvite, band_id: IDS.avaTrio, token: INVITES.avaTrio, created_by: USERS.ava.id },
    { id: IDS.avaTrioExpired, band_id: IDS.avaTrio, token: INVITES.avaTrioExpired, created_by: USERS.ava.id, expires_at: new Date(Date.now() - 86400e3).toISOString() },
  ]));

  // ---- setlists from Jazz Essentials charts
  const sets: { id: string; owner: keyof typeof USERS; name: string; band?: string }[] = [
    { id: IDS.avaSet, owner: "ava", name: "Ava's Standards" },
    { id: IDS.avaSolo, owner: "ava", name: "Ava Solo Ballads" },
    { id: IDS.benSet, owner: "ben", name: "Ben's Bass Tunes" },
    { id: IDS.cleoSet, owner: "cleo", name: "Cleo's Brushes" },
    { id: IDS.devSet, owner: "dev", name: "Dev's Hard Bop" },
    { id: IDS.eliSet, owner: "eli", name: "Eli's Chord Melody" },
    { id: IDS.faySet, owner: "fay", name: "Fay's Open Horn" },
    { id: IDS.avaTrioSet, owner: "ava", name: "Ava Trio Book", band: IDS.avaTrio },
    { id: IDS.devQuartetSet, owner: "dev", name: "Dev Quartet Book", band: IDS.devQuartet },
  ];
  ok("setlists", await sb.from("setlists").insert(sets.map(s => ({ id: s.id, owner: USERS[s.owner].id, name: s.name, band_id: s.band ?? null }))));
  const items = sets.flatMap(s => SET_TUNES[s.id].map((song, position) => ({ setlist_id: s.id, position, song, set_no: 1 })));
  const itemRows = ok("items", await sb.from("setlist_items").insert(items).select("id, setlist_id, position")) as { id: string; setlist_id: string; position: number }[];
  ok("direct members", await sb.from("setlist_members").insert([
    { setlist_id: IDS.avaSet, user_id: USERS.ben.id, role: "viewer" },
    { setlist_id: IDS.avaSet, user_id: USERS.cleo.id, role: "editor" },
  ]));
  const firstItem = (setlist: string) => itemRows.find(r => r.setlist_id === setlist && r.position === 0)!.id;

  // ---- notes, replies, band notes, private song notes
  const tuneKey = songKey(SET_TUNES[IDS.avaSet][0]);
  ok("notes", await ins("notes", [
    { id: IDS.avaSetNote, author: USERS.ava.id, setlist_id: IDS.avaSet, setlist_item_id: firstItem(IDS.avaSet), body: "Take the intro twice.", tag: "arrangement" },
    { id: IDS.avaPrivateNote, author: USERS.ava.id, song_key: tuneKey, body: "Ava's private: watch the bridge." },
    { id: IDS.benPrivateNote, author: USERS.ben.id, song_key: tuneKey, body: "Ben's private: walk it in 4." },
    { id: IDS.avaTrioBandNote, author: USERS.ava.id, band_id: IDS.avaTrio, body: "Rehearsal Thursday 7pm." },
    { id: IDS.devBandNote, author: USERS.dev.id, band_id: IDS.devQuartet, body: "Soundcheck at 6." },
  ]));
  ok("replies", await sb.from("notes").insert({ id: IDS.avaSetReply, author: USERS.cleo.id, parent_id: IDS.avaSetNote, body: "Got it." }));

  // ---- licks (Ava's has notation), a link into the Ava Trio setlist, resources
  const starter = STARTER_LICKS[0];
  ok("licks", await ins("licks", [
    { id: IDS.avaLick, owner: USERS.ava.id, title: "Ava's ii–V–I", body: starter.body, tags: starter.tags, progression: starter.progression, prog_key: starter.key, notation: starter.notation },
    { id: IDS.benLick, owner: USERS.ben.id, title: "Ben's walking line", body: "" },
    { id: IDS.cleoLick, owner: USERS.cleo.id, title: "Cleo's brush pattern", body: "" },
    { id: IDS.devLick, owner: USERS.dev.id, title: "Dev's Trane cell", body: "" },
    { id: IDS.eliLick, owner: USERS.eli.id, title: "Eli's shell voicings", body: "" },
    { id: IDS.fayLick, owner: USERS.fay.id, title: "Fay's Clifford line", body: "" },
  ]));
  ok("lick link", await sb.from("lick_links").insert({ id: IDS.avaLickLink, lick_id: IDS.avaLick, setlist_id: IDS.avaTrioSet, created_by: USERS.ava.id }));
  ok("resources", await ins("resources", [
    { id: IDS.avaRes, owner: USERS.ava.id, kind: "link", title: "Autumn Leaves, Cannonball", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", tags: ["listen"] },
    { id: IDS.avaPdfRes, owner: USERS.ava.id, kind: "file", title: "Changes sheet", tags: ["chart"] },
    { id: IDS.eliRes, owner: USERS.eli.id, kind: "link", title: "Eli's video", url: "https://example.test/eli" },
  ]));
  ok("resource link", await sb.from("resource_links").insert({ resource_id: IDS.avaRes, song_key: tuneKey, created_by: USERS.ava.id }));

  // ---- files: a PDF each on a private note, a band note, a resource, a lick and the Ava Trio press kit
  const pdf = new Blob([TINY_PDF], { type: "application/pdf" });
  const files: [string, string, Record<string, string>, string][] = [
    [IDS.avaPrivateNoteFile, FILES.avaPrivateNote, { note_id: IDS.avaPrivateNote }, USERS.ava.id],
    [IDS.avaTrioNoteFile, FILES.avaTrioNote, { note_id: IDS.avaTrioBandNote }, USERS.ava.id],
    [IDS.avaResFile, FILES.avaRes, { resource_id: IDS.avaPdfRes }, USERS.ava.id],
    [IDS.avaLickFile, FILES.avaLick, { lick_id: IDS.avaLick }, USERS.ava.id],
    [IDS.avaTrioKitFile, FILES.avaTrioKit, { band_id: IDS.avaTrio }, USERS.ava.id],
  ];
  for (const [id, path, parent, by] of files) {
    ok("upload " + path, await sb.storage.from("attachments").upload(path, pdf, { contentType: "application/pdf", upsert: true }));
    ok("attachment " + path, await sb.from("attachments").insert({ id, ...parent, storage_path: path, kind: "pdf", name: path.split("/").pop(), mime: "application/pdf", size: TINY_PDF.length, created_by: by }));
  }

  console.log(`seeded ${WHO.length} musicians (password ${PASSWORD}), 2 bands, ${sets.length} setlists`);
}

main().catch(e => { console.error(e); process.exit(1); });
