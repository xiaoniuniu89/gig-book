// One sharing model (0048): setlists and transcriptions are Private / Bands I'm in / Public. A reader through visibility
// sees the setlist and its tunes, never its notes, files or people, and can't change anything. Signed out gets nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, USERS, type Who } from "../fixtures";
import { admin, anon, cleanScratch, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const PDF = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });

beforeAll(async () => { M = await everyone(); });
afterAll(async () => { await cleanScratch(); await clearTranscriptions(); });

const setVis = async (id: string, visibility: string) => must(await admin().from("setlists").update({ visibility }).eq("id", id), "set visibility");
const sees = async (who: Who, id: string) => (await M[who].sb.from("setlists").select("id").eq("id", id)).data?.length === 1;
const items = async (who: Who, id: string) => (await M[who].sb.from("setlist_items").select("id").eq("setlist_id", id)).data?.length ?? 0;

describe("setlists: Bands I'm in", () => {
  it("is readable, with its tunes, by someone in any band with the owner, and not by a stranger", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const id = await scratchSetlist({ owner: "ava" });
    expect(await sees("ben", id)).toBe(false); // private
    await setVis(id, "bands");
    expect(await sees("ben", id)).toBe(true);
    expect(await items("ben", id)).toBe(1);
    expect(await sees("eli", id)).toBe(false);
    expect(await items("eli", id)).toBe(0);
    // a band joined later counts too
    await M.ava.store.addBandMember(band, USERS.eli.id, ["Guitar"]);
    expect(await sees("eli", id)).toBe(true);
    // back to private hides it again
    await setVis(id, "private");
    expect(await sees("ben", id)).toBe(false);
    expect(await sees("eli", id)).toBe(false);
  });

  it("the store lists it under bandmates' setlists for a bandmate only, and opens it view-only", async () => {
    await scratchBand(["ava"], ["ben"]);
    const id = await scratchSetlist({ owner: "ava" });
    await setVis(id, "bands");
    expect((await M.ben.store.listBandmateSetlists()).some(s => s.id === id)).toBe(true);
    expect((await M.eli.store.listBandmateSetlists()).some(s => s.id === id)).toBe(false);
    expect((await M.ava.store.listBandmateSetlists()).some(s => s.id === id)).toBe(false);
    const s = await M.ben.store.getSetlist(id);
    expect(s?.viewOnly).toBe(true);
    expect(s?.items).toHaveLength(1);
    expect((await M.ava.store.getSetlist(id))?.viewOnly).toBeFalsy();
  });
});

describe("setlists: Public", () => {
  it("any signed-in user can read it, nobody signed out can", async () => {
    const id = await scratchSetlist({ owner: "ava" });
    await setVis(id, "public");
    for (const w of ["ben", "eli", "fay"] as Who[]) { expect(await sees(w, id)).toBe(true); expect(await items(w, id)).toBe(1); }
    expect((await anon().from("setlists").select("id").eq("id", id)).data ?? []).toHaveLength(0);
    expect((await anon().from("setlist_items").select("id").eq("setlist_id", id)).data ?? []).toHaveLength(0);
    // public isn't listed under From your bands
    expect((await M.eli.store.listBandmateSetlists()).some(s => s.id === id)).toBe(false);
  });

  it("only allows private, bands and public", async () => {
    const id = await scratchSetlist({ owner: "ava" });
    expect((await admin().from("setlists").update({ visibility: "link" }).eq("id", id)).error).toBeTruthy();
    expect((await admin().from("setlists").update({ visibility: "bands" }).eq("id", id)).error).toBeNull();
  });
});

describe("setlists: a reader through visibility gets nothing more", () => {
  it("no notes, files or people, and can't change or delete the setlist or its tunes", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    expect(band).toBeTruthy();
    const id = await scratchSetlist({ owner: "ava" });
    await setVis(id, "bands");
    const a = admin();
    const note = must(await a.from("notes").insert({ author: USERS.ava.id, setlist_id: id, tag: "general", body: "Private to the band" }).select("id").single(), "note")!;
    must(await a.from("attachments").insert({ note_id: note.id, storage_path: `set/${id}/${note.id}/x.pdf`, kind: "pdf", name: "x.pdf", mime: "application/pdf", size: 1, created_by: USERS.ava.id }), "attachment");
    // Ben reads the setlist, but none of what hangs off it
    expect(await sees("ben", id)).toBe(true);
    expect((await M.ben.sb.from("notes").select("id").eq("setlist_id", id)).data ?? []).toHaveLength(0);
    expect((await M.ben.sb.from("attachments").select("id").eq("note_id", note.id)).data ?? []).toHaveLength(0);
    expect((await M.ben.sb.from("setlist_members").select("user_id").eq("setlist_id", id)).data ?? []).toHaveLength(0);
    expect((await M.ben.sb.from("notes").insert({ author: USERS.ben.id, setlist_id: id, tag: "general", body: "hi" })).error).toBeTruthy();
    // ...and changes nothing
    expect((await M.ben.sb.from("setlists").update({ name: "Mine now" }).eq("id", id).select("id")).data ?? []).toHaveLength(0);
    expect((await M.ben.sb.from("setlist_items").update({ song: "Hacked" }).eq("setlist_id", id).select("id")).data ?? []).toHaveLength(0);
    expect((await M.ben.sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: [] })).error).toBeTruthy();
    await M.ben.sb.from("setlist_items").delete().eq("setlist_id", id);
    await M.ben.sb.from("setlists").delete().eq("id", id);
    expect(await items("ava", id)).toBe(1);
    expect(await sees("ava", id)).toBe(true);
    // Ben can't flip the visibility either
    expect((await M.ben.sb.from("setlists").update({ visibility: "private" }).eq("id", id).select("id")).data ?? []).toHaveLength(0);
  });

  it("the same goes for a public setlist", async () => {
    const id = await scratchSetlist({ owner: "ava" });
    await setVis(id, "public");
    const note = must(await admin().from("notes").insert({ author: USERS.ava.id, setlist_id: id, tag: "general", body: "Mine" }).select("id").single(), "note")!;
    expect((await M.eli.sb.from("notes").select("id").eq("id", note.id)).data ?? []).toHaveLength(0);
    expect((await M.eli.sb.from("setlists").update({ name: "x" }).eq("id", id).select("id")).data ?? []).toHaveLength(0);
  });
});

describe("setlists: the member, band and gig paths behave as before", () => {
  it("a direct member and a band member still get notes and a role", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const id = await scratchSetlist({ owner: "ava", band, members: { cleo: "viewer" } });
    const note = must(await admin().from("notes").insert({ author: USERS.ava.id, setlist_id: id, tag: "general", body: "Hello" }).select("id").single(), "note")!;
    for (const w of ["cleo", "ben"] as Who[]) {
      expect(await sees(w, id)).toBe(true);
      expect((await M[w].sb.from("notes").select("id").eq("id", note.id)).data).toHaveLength(1);
      expect((await M[w].store.getSetlist(id))?.viewOnly).toBeFalsy();
    }
    expect((await M.eli.sb.from("notes").select("id").eq("id", note.id)).data ?? []).toHaveLength(0);
    expect(await sees("eli", id)).toBe(false);
    // private with a band: members still read it
    expect((await M.ben.sb.rpc("setlist_role", { p_setlist: id })).data).toBeTruthy();
  });

  it("a band's seeded setlist is still shared with its band and nobody else", async () => {
    expect(await sees("ben", IDS.avaTrioSet)).toBe(true);
    expect(await sees("eli", IDS.avaTrioSet)).toBe(false);
  });
});

// ---------------------------------------------------------------- transcriptions
async function makeTr(who: Who, visibility: string) {
  const id = crypto.randomUUID(), path = `${USERS[who].id}/${id}/solo.pdf`;
  must(await M[who].sb.from("transcriptions").insert({
    id, title: "Solo", visibility, file_path: path, file_kind: "pdf", file_name: "solo.pdf", file_mime: "application/pdf", file_size: PDF.size,
  }), "transcription");
  must(await M[who].sb.storage.from("transcriptions").upload(path, PDF, { contentType: "application/pdf" }), "upload");
  return { id, path };
}
async function clearTranscriptions() {
  const a = admin();
  const { data } = await a.from("transcriptions").select("file_path").eq("owner", USERS.ava.id);
  const paths = (data ?? []).map(r => r.file_path as string);
  if (paths.length) await a.storage.from("transcriptions").remove(paths);
  await a.from("transcriptions").delete().eq("owner", USERS.ava.id);
  await a.from("transcription_upload_log").delete().eq("owner", USERS.ava.id);
}
const trSees = async (who: Who, id: string) => (await M[who].sb.from("transcriptions").select("id").eq("id", id)).data?.length === 1;
const trFile = async (who: Who, path: string) => !(await M[who].sb.storage.from("transcriptions").download(path)).error;

describe("transcriptions: Bands I'm in", () => {
  it("a bandmate reads the row and downloads the file; a stranger does neither", async () => {
    await clearTranscriptions();
    await scratchBand(["ava"], ["ben"]);
    const t = await makeTr("ava", "bands");
    expect(await trSees("ben", t.id)).toBe(true);
    expect(await trFile("ben", t.path)).toBe(true);
    expect(await trSees("eli", t.id)).toBe(false);
    expect(await trFile("eli", t.path)).toBe(false);
    expect((await anon().from("transcriptions").select("id").eq("id", t.id)).data ?? []).toHaveLength(0);
    // bandmates can't change or delete it
    expect((await M.ben.sb.from("transcriptions").update({ title: "x" }).eq("id", t.id).select("id")).data ?? []).toHaveLength(0);
    // private again: gone for the bandmate
    must(await M.ava.sb.from("transcriptions").update({ visibility: "private" }).eq("id", t.id), "private");
    expect(await trSees("ben", t.id)).toBe(false);
    expect(await trFile("ben", t.path)).toBe(false);
    // one-at-a-time shares still work
    must(await admin().from("transcription_shares").insert({ transcription_id: t.id, user_id: USERS.eli.id }), "share");
    expect(await trSees("eli", t.id)).toBe(true);
    expect(await trFile("eli", t.path)).toBe(true);
  });
});
