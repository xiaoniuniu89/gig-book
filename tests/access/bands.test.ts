// Bands: who may change what, invites, the last-admin rule, and what a removed member loses.
import { beforeAll, describe, expect, it } from "vitest";
import { FILES, IDS, INVITES, TINY_PDF, USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const memberIds = async (band: string) => ((await admin().from("band_members").select("user_id").eq("band_id", band)).data ?? []).map(r => r.user_id);
const rpc = (m: Musician, fn: string, args: object) => m.sb.rpc(fn, args);

describe("seeded bands through the adapter", () => {
  it("lists each person's bands with their effective permissions", async () => {
    const ava = await M.ava.store.listBands();
    expect(ava.map(b => b.name).sort()).toEqual(["Ava Trio", "Dev Quartet"]);
    expect(ava.every(b => b.role === "admin" && b.perms.invite && b.perms.edit_setlists)).toBe(true);
    const ben = await M.ben.store.listBands();
    expect(ben.find(b => b.id === IDS.avaTrio)?.perms).toEqual({ notes: true, edit_setlists: true, add_setlists: false, invite: false });
    expect(ben.find(b => b.id === IDS.devQuartet)?.perms).toEqual({ notes: true, edit_setlists: false, add_setlists: false, invite: false });
    expect((await M.cleo.store.listBands()).map(b => b.name)).toEqual(["Ava Trio"]);
    expect(await M.eli.store.listBands()).toEqual([]);
  });

  it("getBand is null for outsiders", async () => {
    expect(await M.eli.store.getBand(IDS.avaTrio)).toBeNull();
    expect(await M.dev.store.getBand(IDS.avaTrio)).toBeNull();
    expect(await M.fay.store.getBand(IDS.avaTrio)).toBeNull();
    expect(await M.fay.store.getBand(IDS.devQuartet)).toBeTruthy();
  });

  it("band setlists are listed to members only", async () => {
    expect((await M.cleo.store.listBandSetlists(IDS.avaTrio)).map(s => s.id)).toContain(IDS.avaTrioSet);
    expect(await M.eli.store.listBandSetlists(IDS.avaTrio)).toEqual([]);
    expect(await M.dev.store.listBandSetlists(IDS.avaTrio)).toEqual([]);
  });
});

describe("settings and permissions", () => {
  it("only admins change the band's settings and default permissions", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const f = { name: "Renamed", defaultPerms: { notes: true, edit_setlists: true, add_setlists: true, invite: true }, bio: "", contact: {}, epkSlug: null };
    await expect(M.ben.store.updateBand(band, f)).rejects.toThrow();
    await expect(M.eli.store.updateBand(band, f)).rejects.toThrow();
    expect((await admin().from("bands").select("name").eq("id", band).single()).data?.name).toBe("Scratch Band");
    await M.ava.store.updateBand(band, f);
    expect((await admin().from("bands").select("name").eq("id", band).single()).data?.name).toBe("Renamed");
  });

  it("only admins change roles and per-person permissions", async () => {
    const band = await scratchBand(["ava"], ["ben", "cleo"]);
    expect((await rpc(M.ben, "band_set_member", { p_band: band, p_user: USERS.ben.id, p_role: "admin" })).error).toBeTruthy();
    expect((await rpc(M.ben, "band_set_member", { p_band: band, p_user: USERS.cleo.id, p_role: "member", p_perms: { invite: true } })).error).toBeTruthy();
    expect((await rpc(M.eli, "band_set_member", { p_band: band, p_user: USERS.cleo.id, p_role: "admin" })).error).toBeTruthy();
    // a direct table write doesn't work either
    const direct = await M.ben.sb.from("band_members").update({ role: "admin" }).eq("band_id", band).eq("user_id", USERS.ben.id).select("user_id");
    expect(direct.data ?? []).toHaveLength(0);
    must(await rpc(M.ava, "band_set_member", { p_band: band, p_user: USERS.cleo.id, p_role: "member", p_perms: { invite: true, bogus: true } }), "admin sets perms");
    const b = await M.cleo.store.getBand(band);
    expect(b?.perms.invite).toBe(true);
    expect(b?.perms.edit_setlists).toBe(false);
    expect((await admin().from("band_members").select("perms").eq("band_id", band).eq("user_id", USERS.cleo.id).single()).data?.perms).toEqual({ invite: true });
  });

  it("only admins remove members, switch off links or delete the band", async () => {
    const band = await scratchBand(["ava"], ["ben", "cleo"]);
    expect((await rpc(M.ben, "band_remove_member", { p_band: band, p_user: USERS.cleo.id })).error).toBeTruthy();
    expect((await rpc(M.ben, "band_revoke_invites", { p_band: band })).error).toBeTruthy();
    expect((await rpc(M.ben, "band_delete", { p_band: band })).error).toBeTruthy();
    expect((await rpc(M.eli, "band_delete", { p_band: band })).error).toBeTruthy();
    expect(await memberIds(band)).toHaveLength(3);
    must(await rpc(M.ava, "band_remove_member", { p_band: band, p_user: USERS.cleo.id }), "admin removes");
    expect(await memberIds(band)).toHaveLength(2);
  });

  it("creating a band makes you its admin and nobody else sees it", async () => {
    const b = await M.eli.store.createBand("Eli's Duo", { notes: true, edit_setlists: false, add_setlists: true, invite: false });
    expect(b.role).toBe("admin");
    expect(b.defaultPerms.add_setlists).toBe(true);
    expect(await M.ava.store.getBand(b.id)).toBeNull();
    await M.eli.store.deleteBand(b.id);
    expect(await M.eli.store.getBand(b.id)).toBeNull();
  });
});

describe("the last admin", () => {
  it("can't leave or be demoted; can once someone else is an admin", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    expect((await rpc(M.ava, "band_leave", { p_band: band })).error?.message).toMatch(/only admin/i);
    expect((await rpc(M.ava, "band_set_member", { p_band: band, p_user: USERS.ava.id, p_role: "member" })).error?.message).toMatch(/at least one admin/i);
    expect((await rpc(M.ava, "band_remove_member", { p_band: band, p_user: USERS.ava.id })).error).toBeTruthy();
    expect(await memberIds(band)).toContain(USERS.ava.id);
    must(await rpc(M.ava, "band_set_member", { p_band: band, p_user: USERS.ben.id, p_role: "admin" }), "promote");
    must(await rpc(M.ava, "band_leave", { p_band: band }), "leave");
    expect(await memberIds(band)).toEqual([USERS.ben.id]);
    // now Ben is the last one
    expect((await rpc(M.ben, "band_leave", { p_band: band })).error).toBeTruthy();
  });

  it("members can leave freely, taking their setlists out of the band", async () => {
    const band = await scratchBand(["ava"], ["cleo"]);
    const mine = await scratchSetlist({ owner: "cleo", band });
    expect((await M.ava.store.getSetlist(mine))?.role).toBe("editor"); // admin of the band
    must(await rpc(M.cleo, "band_leave", { p_band: band }), "leave");
    expect(await M.ava.store.getSetlist(mine)).toBeNull();
    expect((await M.cleo.store.getSetlist(mine))?.role).toBe("owner");
    expect((await admin().from("setlists").select("band_id").eq("id", mine).single()).data?.band_id).toBeNull();
  });
});

describe("invites", () => {
  it("a link works until it is switched off, and joining twice doesn't duplicate", async () => {
    const band = await scratchBand(["ava"]);
    const token = await M.ava.store.createBandInvite(band);
    expect(await M.eli.store.bandInviteInfo(token)).toEqual({ bandId: band, name: "Scratch Band" });
    await M.eli.store.acceptBandInvite(token, ["Guitar"]);
    await M.eli.store.acceptBandInvite(token, ["Guitar"]);
    expect((await memberIds(band)).filter(i => i === USERS.eli.id)).toHaveLength(1);
    const eli = await M.eli.store.getBand(band);
    expect(eli?.role).toBe("member");
    expect(eli?.plays).toEqual(["Guitar"]);
    expect(eli?.perms.notes).toBe(true); // the band's default permissions
    expect(eli?.perms.edit_setlists).toBe(false);
    await M.ava.store.revokeBandInvites(band);
    expect(await M.dev.store.bandInviteInfo(token)).toBeNull();
    await expect(M.dev.store.acceptBandInvite(token, [])).rejects.toThrow(/expired|switched off/i);
    expect(await memberIds(band)).not.toContain(USERS.dev.id);
  });

  it("an expired link fails", async () => {
    expect(await M.eli.store.bandInviteInfo(INVITES.avaTrioExpired)).toBeNull();
    await expect(M.eli.store.acceptBandInvite(INVITES.avaTrioExpired, [])).rejects.toThrow();
    expect(await memberIds(IDS.avaTrio)).not.toContain(USERS.eli.id);
  });

  it("the unused seeded link is valid; nonsense tokens aren't; signed-out people can't ask", async () => {
    expect((await M.eli.store.bandInviteInfo(INVITES.avaTrio))?.name).toBe("Ava Trio");
    expect(await M.eli.store.bandInviteInfo("nonsense")).toBeNull();
    await expect(M.eli.store.acceptBandInvite("nonsense", [])).rejects.toThrow();
    expect((await anon().rpc("band_invite_info", { p_token: INVITES.avaTrio })).error).toBeTruthy();
    expect((await anon().rpc("band_accept_invite", { p_token: INVITES.avaTrio })).error).toBeTruthy();
  });

  it("the invite_tokens table isn't readable", async () => {
    for (const m of [M.ava, M.eli]) {
      const r = await m.sb.from("band_invites").select("token");
      expect(r.data ?? []).toHaveLength(0);
    }
  });

  it("a link dies if its creator loses the invite permission", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    must(await rpc(M.ava, "band_set_member", { p_band: band, p_user: USERS.ben.id, p_role: "member", p_perms: { invite: true } }), "grant");
    const token = await M.ben.store.createBandInvite(band);
    expect(await M.eli.store.bandInviteInfo(token)).toBeTruthy();
    must(await rpc(M.ava, "band_set_member", { p_band: band, p_user: USERS.ben.id, p_role: "member", p_perms: { invite: false } }), "revoke");
    expect(await M.eli.store.bandInviteInfo(token)).toBeNull();
  });

  it("making links needs the invite permission", async () => {
    await expect(M.cleo.store.createBandInvite(IDS.avaTrio)).rejects.toThrow();
    await expect(M.ben.store.createBandInvite(IDS.avaTrio)).rejects.toThrow(); // edit_setlists isn't invite
    await expect(M.eli.store.createBandInvite(IDS.avaTrio)).rejects.toThrow();
    expect(await M.ava.store.createBandInvite(IDS.avaTrio)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("adding people by search", () => {
  it("band_search_users needs the invite permission", async () => {
    for (const w of ["cleo", "ben", "eli", "fay"] as Who[]) {
      const r = await M[w].sb.rpc("band_search_users", { p_band: IDS.avaTrio, p_q: "Dev" });
      expect(r.error, w).toBeTruthy();
    }
    const ok = await M.ava.store.searchBandUsers(IDS.avaTrio, "Dev");
    expect(ok).toEqual([{ userId: USERS.dev.id, name: "Dev", instruments: ["Tenor sax"] }]);
  });

  it("finds by exact email or part of a name, skips members, and respects the instrument choice", async () => {
    const byEmail = await M.ava.store.searchBandUsers(IDS.avaTrio, "eli@gigbook.test");
    expect(byEmail.map(c => c.name)).toEqual(["Eli"]);
    expect(byEmail[0].instruments).toEqual([]); // Eli shares no instruments
    expect((await M.ava.store.searchBandUsers(IDS.avaTrio, "Ben")).map(c => c.name)).toEqual([]); // already a member
    expect(await M.ava.store.searchBandUsers(IDS.avaTrio, "e")).toEqual([]); // too short
    expect((await M.ava.store.searchBandUsers(IDS.avaTrio, "gigbook")).length).toBe(0); // a partial email is not a match
  });

  it("adding needs the permission too, and an unknown id is refused", async () => {
    await expect(M.cleo.store.addBandMember(IDS.avaTrio, USERS.eli.id, [])).rejects.toThrow();
    const band = await scratchBand(["ava"]);
    await M.ava.store.addBandMember(band, USERS.eli.id, ["Guitar"]);
    await M.ava.store.addBandMember(band, USERS.eli.id, ["Guitar"]);
    expect((await memberIds(band)).filter(i => i === USERS.eli.id)).toHaveLength(1);
    await expect(M.ava.store.addBandMember(band, "00000000-0000-4000-8000-0000000000ff", [])).rejects.toThrow();
  });
});

describe("a removed member loses everything at once", () => {
  it("reads, notes, files and setlists", async () => {
    const band = await scratchBand(["ava"], ["fay"]);
    const bandSet = await scratchSetlist({ owner: "ava", band });
    const hers = await scratchSetlist({ owner: "fay", band });
    const note = await M.ava.store.addNote({ kind: "band", bandId: band }, { body: "Gig details" });
    const path = `band/${band}/${note.id}/plan.pdf`;
    must(await admin().storage.from("attachments").upload(path, new Blob([TINY_PDF], { type: "application/pdf" }), { contentType: "application/pdf" }), "file");
    must(await admin().from("attachments").insert({ note_id: note.id, storage_path: path, kind: "pdf", name: "plan.pdf", mime: "application/pdf", size: 1, created_by: USERS.ava.id }), "row");
    const kit = `band/${band}/kit/${USERS.ava.id}.pdf`;
    must(await admin().storage.from("attachments").upload(kit, new Blob([TINY_PDF], { type: "application/pdf" }), { contentType: "application/pdf" }), "kit");

    // before
    const read = async () => ({
      band: !!(await M.fay.store.getBand(band)),
      members: (await M.fay.store.listBandMembers(band)).length,
      setlist: !!(await M.fay.store.getSetlist(bandSet)),
      notes: (await M.fay.store.listNotes({ kind: "band", bandId: band })).length,
      files: (await M.fay.store.listAttachments([note.id])).length,
      download: !(await M.fay.sb.storage.from("attachments").download(path)).error,
      kit: !(await M.fay.sb.storage.from("attachments").download(kit)).error,
      post: await M.fay.store.addNote({ kind: "band", bandId: band }, { body: "still here" }).then(() => true, () => false),
    });
    expect(await read()).toEqual({ band: true, members: 2, setlist: true, notes: 1, files: 1, download: true, kit: true, post: true });

    must(await rpc(M.ava, "band_remove_member", { p_band: band, p_user: USERS.fay.id }), "remove");

    expect(await read()).toEqual({ band: false, members: 0, setlist: false, notes: 0, files: 0, download: false, kit: false, post: false });
    // her own setlist left the band with her but is still hers
    expect((await M.fay.store.getSetlist(hers))?.role).toBe("owner");
    expect(await M.ava.store.getSetlist(hers)).toBeNull();
    expect(await M.fay.store.listBands()).not.toContainEqual(expect.objectContaining({ id: band }));
  });
});

describe("deleting a band", () => {
  it("keeps the members' setlists, drops the band's notes and links", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const sl = await scratchSetlist({ owner: "ben", band });
    await M.ava.store.addNote({ kind: "band", bandId: band }, { body: "bye" });
    await M.ava.store.deleteBand(band);
    expect((await M.ben.store.getSetlist(sl))?.role).toBe("owner");
    expect((await admin().from("setlists").select("band_id").eq("id", sl).single()).data?.band_id).toBeNull();
    expect((await admin().from("notes").select("id").eq("band_id", band)).data).toHaveLength(0);
    expect(await M.ben.store.getBand(band)).toBeNull();
  });
});

describe("press kit files", () => {
  it("are readable by band members, writable by admins only", async () => {
    const dl = async (w: Who) => !(await M[w].sb.storage.from("attachments").download(FILES.avaTrioKit)).error;
    expect(await dl("ava")).toBe(true);
    expect(await dl("cleo")).toBe(true);
    expect(await dl("eli")).toBe(false);
    expect(await dl("dev")).toBe(false);
    const path = `band/${IDS.avaTrio}/kit/from-cleo.pdf`;
    const up = (w: Who) => M[w].sb.storage.from("attachments").upload(path, new Blob([TINY_PDF], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect((await up("cleo")).error).toBeTruthy();
    expect((await up("ava")).error).toBeNull();
    await M.ava.sb.storage.from("attachments").remove([path]);
  });
});
