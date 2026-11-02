// Notes, replies and the files attached to them: who sees and writes what.
import { beforeAll, describe, expect, it } from "vitest";
import { FILES, IDS, TINY_PDF, USERS, type Who } from "../fixtures";
import { songKey } from "@/lib/songs";
import { SET_TUNES } from "../fixtures";
import { admin, everyone, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const bandNotes = (bandId: string) => ({ kind: "band", bandId }) as const;
const canRead = async (m: Musician, path: string) => !(await m.sb.storage.from("attachments").download(path)).error;
const seen = async (m: Musician, bandId: string) => (await m.store.listNotes(bandNotes(bandId))).map(n => n.id);

describe("band notes", () => {
  it("are visible to band members only", async () => {
    for (const w of ["ava", "ben", "cleo"] as Who[]) expect(await seen(M[w], IDS.avaTrio)).toContain(IDS.avaTrioBandNote);
    for (const w of ["dev", "eli", "fay"] as Who[]) expect(await seen(M[w], IDS.avaTrio)).toEqual([]);
    for (const w of ["dev", "ava", "ben", "fay"] as Who[]) expect(await seen(M[w], IDS.devQuartet)).toContain(IDS.devBandNote);
    for (const w of ["cleo", "eli"] as Who[]) expect(await seen(M[w], IDS.devQuartet)).toEqual([]);
  });

  it("can be posted by members with the notes permission (the default), not by outsiders", async () => {
    const band = await scratchBand(["ava"], ["cleo"]);
    const n = await M.cleo.store.addNote(bandNotes(band), { body: "Charts are in the folder." });
    expect(n.authorName).toBe("You");
    expect(await seen(M.ava, band)).toContain(n.id);
    await expect(M.eli.store.addNote(bandNotes(band), { body: "hi" })).rejects.toThrow();
    await expect(M.eli.store.addNote(bandNotes(IDS.avaTrio), { body: "hi" })).rejects.toThrow();
  });

  it("a member without the notes permission can read but not post, reply or edit", async () => {
    const band = await scratchBand(["ava"], ["cleo"], { notes: false, edit_setlists: false, add_setlists: false, invite: false });
    const note = await M.ava.store.addNote(bandNotes(band), { body: "Read only for Cleo." });
    expect(await seen(M.cleo, band)).toEqual([note.id]);
    await expect(M.cleo.store.addNote(bandNotes(band), { body: "no" })).rejects.toThrow();
    await expect(M.cleo.store.addNote(bandNotes(band), { body: "no", parentId: note.id })).rejects.toThrow();
    expect(await seen(M.ava, band)).toHaveLength(1);
  });

  it("can be deleted by their author or a band admin, not by other members", async () => {
    const band = await scratchBand(["ava"], ["ben", "cleo"]);
    const byBen = await M.ben.store.addNote(bandNotes(band), { body: "Ben's" });
    await M.cleo.store.deleteNote(byBen.id); // no error, nothing deleted
    expect(await seen(M.ava, band)).toContain(byBen.id);
    await M.ava.store.deleteNote(byBen.id);
    expect(await seen(M.ava, band)).not.toContain(byBen.id);
    const byCleo = await M.cleo.store.addNote(bandNotes(band), { body: "Cleo's" });
    await M.cleo.store.deleteNote(byCleo.id);
    expect(await seen(M.ava, band)).toEqual([]);
  });

  it("can't be edited by someone else", async () => {
    await expect(M.cleo.store.updateNote(IDS.avaTrioBandNote, { body: "hijacked" })).rejects.toThrow();
    const { data } = await admin().from("notes").select("body").eq("id", IDS.avaTrioBandNote).single();
    expect(data?.body).toBe("Rehearsal Thursday 7pm.");
  });
});

describe("my notes on a song", () => {
  const key = songKey(SET_TUNES[IDS.avaSet][0]);

  it("belong to the author only", async () => {
    const mine = await M.ava.store.listNotes({ kind: "song", songKey: key });
    expect(mine.map(n => n.id)).toEqual([IDS.avaPrivateNote]);
    const bens = await M.ben.store.listNotes({ kind: "song", songKey: key });
    expect(bens.map(n => n.id)).toEqual([IDS.benPrivateNote]);
    // even a raw select without the author filter finds nothing of anyone else's
    for (const w of ["ben", "cleo", "dev", "eli", "fay"] as Who[]) {
      const r = await M[w].sb.from("notes").select("id").eq("id", IDS.avaPrivateNote);
      expect(r.data ?? []).toHaveLength(0);
    }
    const all = await M.ben.sb.from("notes").select("id").eq("song_key", key);
    expect(all.data?.map(n => n.id)).toEqual([IDS.benPrivateNote]);
  });

  it("can't be replied to, edited or deleted by someone else", async () => {
    const reply = await M.ben.sb.from("notes").insert({ parent_id: IDS.avaPrivateNote, body: "peek" });
    expect(reply.error).toBeTruthy();
    await expect(M.ben.store.updateNote(IDS.avaPrivateNote, { body: "x" })).rejects.toThrow();
    await M.ben.store.deleteNote(IDS.avaPrivateNote);
    const { data } = await admin().from("notes").select("id").eq("id", IDS.avaPrivateNote);
    expect(data).toHaveLength(1);
  });
});

describe("setlist notes", () => {
  it("are visible to every member of the setlist and nobody else", async () => {
    const { data } = await admin().from("notes").select("setlist_item_id").eq("id", IDS.avaSetNote).single();
    const home = { kind: "item", setlistId: IDS.avaSet, itemId: data?.setlist_item_id as string } as const;
    for (const w of ["ava", "ben", "cleo"] as Who[]) {
      const ids = (await M[w].store.listNotes(home)).map(n => n.id);
      expect(ids).toEqual([IDS.avaSetNote, IDS.avaSetReply]);
    }
    for (const w of ["dev", "eli", "fay"] as Who[]) expect(await M[w].store.listNotes(home)).toEqual([]);
  });

  it("can be posted by viewers too, not by outsiders", async () => {
    const id = await scratchSetlist({ owner: "ava", members: { ben: "viewer" } });
    const home = { kind: "setlist", setlistId: id } as const;
    const n = await M.ben.store.addNote(home, { body: "From a viewer" });
    expect((await M.ava.store.listNotes(home)).map(x => x.id)).toContain(n.id);
    await expect(M.eli.store.addNote(home, { body: "no" })).rejects.toThrow();
    await expect(M.eli.store.addNote(home, { body: "no", parentId: n.id })).rejects.toThrow();
  });

  it("can be deleted by the setlist owner", async () => {
    const id = await scratchSetlist({ owner: "ava", members: { ben: "editor", cleo: "viewer" } });
    const home = { kind: "setlist", setlistId: id } as const;
    const n = await M.ben.store.addNote(home, { body: "Ben's" });
    await M.cleo.store.deleteNote(n.id);
    expect(await M.ava.store.listNotes(home)).toHaveLength(1);
    await M.ava.store.deleteNote(n.id);
    expect(await M.ava.store.listNotes(home)).toHaveLength(0);
  });
});

describe("files on notes (storage follows the row)", () => {
  it("band note files are readable by band members only", async () => {
    for (const w of ["ava", "ben", "cleo"] as Who[]) expect(await canRead(M[w], FILES.avaTrioNote)).toBe(true);
    for (const w of ["dev", "eli", "fay"] as Who[]) expect(await canRead(M[w], FILES.avaTrioNote)).toBe(false);
    for (const w of ["ben", "eli"] as Who[]) {
      const rows = await M[w].store.listAttachments([IDS.avaTrioBandNote]);
      expect(rows.length).toBe(w === "ben" ? 1 : 0);
    }
  });

  it("private song note files are readable by the author only", async () => {
    expect(await canRead(M.ava, FILES.avaPrivateNote)).toBe(true);
    for (const w of ["ben", "cleo", "dev", "eli", "fay"] as Who[]) {
      expect(await canRead(M[w], FILES.avaPrivateNote)).toBe(false);
      expect(await M[w].store.listAttachments([IDS.avaPrivateNote])).toEqual([]);
    }
  });

  it("only people who may post can upload to a note, and signed urls follow the same rule", async () => {
    const path = `band/${IDS.avaTrio}/${IDS.avaTrioBandNote}/from-cleo.pdf`;
    const body = new Blob([TINY_PDF], { type: "application/pdf" });
    const denied = await M.eli.sb.storage.from("attachments").upload(path, body, { contentType: "application/pdf" });
    expect(denied.error).toBeTruthy();
    const ok = await M.cleo.sb.storage.from("attachments").upload(path, body, { contentType: "application/pdf" });
    expect(ok.error).toBeNull();
    expect((await M.ben.sb.storage.from("attachments").createSignedUrl(path, 60)).data?.signedUrl).toBeTruthy();
    expect((await M.eli.sb.storage.from("attachments").createSignedUrl(path, 60)).data?.signedUrl).toBeFalsy();
    await M.cleo.sb.storage.from("attachments").remove([path]);
    // someone else's path under your own user folder doesn't work either
    const sneaky = await M.eli.sb.storage.from("attachments").upload(`user/${USERS.ava.id}/${IDS.avaPrivateNote}/x.pdf`, body, { contentType: "application/pdf" });
    expect(sneaky.error).toBeTruthy();
  });

  it("can't be deleted by someone who can only read them", async () => {
    await M.cleo.sb.storage.from("attachments").remove([FILES.avaTrioNote]);
    expect(await canRead(M.ava, FILES.avaTrioNote)).toBe(true);
    const row = await M.cleo.sb.from("attachments").delete().eq("id", IDS.avaTrioNoteFile).select("id");
    expect(row.data ?? []).toHaveLength(0);
  });
});
