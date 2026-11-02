// Notifications reach the right people only.
import { beforeAll, describe, expect, it } from "vitest";
import { USERS, WHO, type Who } from "../fixtures";
import { admin, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

/** Who got a notification of `kind` whose payload mentions `key` = `value`. */
async function recipients(kind: string, key: string, value: string): Promise<Who[]> {
  const { data } = await admin().from("notifications").select("user_id, payload").eq("kind", kind);
  const ids = new Set((data ?? []).filter(r => (r.payload as Record<string, string>)[key] === value).map(r => r.user_id));
  return WHO.filter(w => ids.has(USERS[w].id));
}

describe("added to a band", () => {
  it("goes to the person added, not to the band or bystanders", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    await M.ava.store.addBandMember(band, USERS.eli.id, ["Guitar"]);
    expect(await recipients("added_to_band", "band_id", band)).toEqual(["eli"]);
    const mine = await M.eli.store.listNotifications();
    expect(mine.find(n => n.bandId === band)).toMatchObject({ kind: "added_to_band", bandName: "Scratch Band", actorName: "Ava", read: false });
    for (const w of ["ava", "ben", "cleo", "dev", "fay"] as Who[]) expect((await M[w].store.listNotifications()).some(n => n.bandId === band)).toBe(false);
  });

  it("isn't sent when someone joins by a link, or is already a member", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    await M.ava.store.addBandMember(band, USERS.ben.id, []);
    const token = await M.ava.store.createBandInvite(band);
    await M.cleo.store.acceptBandInvite(token, []);
    expect(await recipients("added_to_band", "band_id", band)).toEqual([]);
  });
});

describe("a new band note", () => {
  it("reaches the other members only", async () => {
    const band = await scratchBand(["ava"], ["ben", "cleo"]);
    const note = await M.ben.store.addNote({ kind: "band", bandId: band }, { body: "Dress code: black" });
    expect(await recipients("note_in_band", "note_id", note.id)).toEqual(["ava", "cleo"]);
    expect((await M.cleo.store.listNotifications()).find(n => n.bandId === band)).toMatchObject({ kind: "note_in_band", actorName: "Ben" });
    expect((await M.ben.store.listNotifications()).some(n => n.bandId === band)).toBe(false);
    expect((await M.eli.store.listNotifications()).some(n => n.bandId === band)).toBe(false);
  });

  it("a reply goes to the note's author only", async () => {
    const band = await scratchBand(["ava"], ["ben", "cleo"]);
    const note = await M.ben.store.addNote({ kind: "band", bandId: band }, { body: "Who has the PA?" });
    const reply = await M.cleo.store.addNote({ kind: "band", bandId: band }, { body: "I do", parentId: note.id });
    expect(await recipients("note_in_band", "note_id", reply.id)).toEqual(["ben"]);
  });

  it("stops reaching someone who has been removed", async () => {
    const band = await scratchBand(["ava"], ["fay"]);
    must(await M.ava.sb.rpc("band_remove_member", { p_band: band, p_user: USERS.fay.id }), "remove");
    const note = await M.ava.store.addNote({ kind: "band", bandId: band }, { body: "After Fay" });
    expect(await recipients("note_in_band", "note_id", note.id)).toEqual([]);
  });
});

describe("a note on a setlist", () => {
  it("reaches the owner and direct members, not the author or outsiders", async () => {
    const id = await scratchSetlist({ owner: "ava", members: { ben: "viewer", cleo: "editor" } });
    const note = await M.cleo.store.addNote({ kind: "setlist", setlistId: id }, { body: "Key change?" });
    expect(await recipients("note_on_setlist", "note_id", note.id)).toEqual(["ava", "ben"]);
  });
});

describe("notifications are private", () => {
  it("each person reads only their own and can only mark them read", async () => {
    const all = await M.ben.sb.from("notifications").select("user_id");
    expect(new Set((all.data ?? []).map(r => r.user_id))).toEqual(new Set([USERS.ben.id].filter(() => (all.data ?? []).length > 0)));
    const others = await admin().from("notifications").select("id").eq("user_id", USERS.ava.id).limit(1);
    const aid = others.data?.[0]?.id;
    expect(aid).toBeTruthy();
    const peek = await M.ben.sb.from("notifications").select("id").eq("id", aid);
    expect(peek.data ?? []).toHaveLength(0);
    const mark = await M.ben.sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", aid).select("id");
    expect(mark.data ?? []).toHaveLength(0);
    const forge = await M.ben.sb.from("notifications").insert({ user_id: USERS.ben.id, kind: "added_to_band", payload: {} });
    expect(forge.error).toBeTruthy();
    const rewrite = await M.ben.sb.from("notifications").update({ payload: {} }).eq("user_id", USERS.ben.id);
    expect(rewrite.error).toBeTruthy();
  });

  it("can be marked read by their owner", async () => {
    const band = await scratchBand(["ava"]);
    await M.ava.store.addBandMember(band, USERS.dev.id, []);
    const n = (await M.dev.store.listNotifications()).find(x => x.bandId === band);
    expect(n?.read).toBe(false);
    await M.dev.store.markNotificationsRead([n!.id]);
    expect((await M.dev.store.listNotifications()).find(x => x.bandId === band)?.read).toBe(true);
  });
});
