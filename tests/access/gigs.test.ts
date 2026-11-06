// Gigs (R15): who reads and edits a gig, linked setlists, lineup contacts and the poster photos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, cleanScratch, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const gigs: string[] = [];
afterAll(async () => {
  if (gigs.length) await admin().from("gigs").delete().in("id", gigs);
  await admin().from("notifications").delete().eq("kind", "added_to_gig");
  await cleanScratch();
});

/** A scratch gig made with the service role. `lineup` are fake musicians; `band` optionally ties it to a band. */
async function scratchGig(o: { creator: Who; lineup?: Who[]; band?: string; setlists?: string[] }): Promise<string> {
  const a = admin(), id = crypto.randomUUID();
  gigs.push(id);
  must(await a.from("gigs").insert({ id, created_by: USERS[o.creator].id, band_id: o.band ?? null, title: "Scratch gig", gig_date: "2030-01-01" }), "scratch gig");
  if (o.lineup?.length) must(await a.from("gig_lineup").insert(o.lineup.map(w => ({ gig_id: id, user_id: USERS[w].id, plays: "x" }))), "scratch lineup");
  for (const [i, s] of (o.setlists ?? []).entries()) must(await a.from("gig_setlists").insert({ gig_id: id, setlist_id: s, position: i }), "scratch gig setlist");
  return id;
}
const lineupOf = async (m: Musician, gig: string) => ((await m.sb.rpc("gig_lineup_list", { p_gig: gig })).data ?? []) as { user_id: string | null; name: string; contact: Record<string, string> }[];

describe("who can read a gig", () => {
  it("is closed to signed-out callers", async () => {
    const gig = await scratchGig({ creator: "ava" });
    expect((await anon().from("gigs").select("id").eq("id", gig)).data ?? []).toEqual([]);
    expect((await anon().rpc("gig_lineup_list", { p_gig: gig })).error).toBeTruthy();
  });

  it("an outsider can't read the gig, its lineup or its setlists", async () => {
    const set = await scratchSetlist({ owner: "ava" });
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], setlists: [set] });
    expect((await M.eli.sb.from("gigs").select("id").eq("id", gig)).data).toEqual([]);
    expect((await M.eli.sb.from("gig_lineup").select("id").eq("gig_id", gig)).data).toEqual([]);
    expect((await M.eli.sb.from("gig_setlists").select("gig_id").eq("gig_id", gig)).data).toEqual([]);
    expect(await lineupOf(M.eli, gig)).toEqual([]);
    expect(await M.eli.store.getGig(gig)).toBeNull();
    expect((await M.eli.sb.from("setlists").select("id").eq("id", set)).data).toEqual([]);
  });

  it("the creator, the lineup and band members read it", async () => {
    const band = await scratchBand(["ava"], ["cleo"]);
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], band });
    for (const w of ["ava", "ben", "cleo"] as Who[]) expect((await M[w].store.getGig(gig))?.id).toBe(gig);
    expect(await M.eli.store.getGig(gig)).toBeNull();
    expect((await M.cleo.store.listBandGigs(band)).map(g => g.id)).toContain(gig);
  });

  it("only the creator and the band's admins can make changes", async () => {
    const band = await scratchBand(["ava", "dev"], ["cleo"]);
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], band });
    const fields = { title: "Changed", date: "2030-02-02", time: "9pm", venue: "", address: "", schedule: "", notes: "", bandId: band };
    await expect(M.ben.store.updateGig(gig, fields)).rejects.toThrow();
    await expect(M.cleo.store.updateGig(gig, fields)).rejects.toThrow();
    await M.dev.store.updateGig(gig, fields);
    expect((await M.ava.store.getGig(gig))?.title).toBe("Changed");
    expect((await M.dev.store.getGig(gig))?.canEdit).toBe(true);
    expect((await M.ben.store.getGig(gig))?.canEdit).toBe(false);
    await expect(M.cleo.store.deleteGig(gig)).rejects.toThrow();
    await M.dev.store.deleteGig(gig);
    expect(await M.ava.store.getGig(gig)).toBeNull();
  });

  it("you can't make a gig as someone else or for a band you aren't in", async () => {
    const band = await scratchBand(["ava"]);
    const row = { title: "x", gig_date: "2030-01-01" };
    expect((await M.eli.sb.from("gigs").insert({ ...row, created_by: USERS.ava.id })).error).toBeTruthy();
    expect((await M.eli.sb.from("gigs").insert({ ...row, band_id: band })).error).toBeTruthy();
    const mine = await M.eli.store.createGig({ title: "Mine", date: "2030-01-01", time: "", venue: "", address: "", schedule: "", notes: "", bandId: null });
    gigs.push(mine.id);
    expect(mine.mine && mine.canEdit).toBe(true);
    await M.eli.store.deleteGig(mine.id);
  });
});

describe("setlists on a gig", () => {
  it("the lineup can read a linked setlist but not edit it", async () => {
    const set = await scratchSetlist({ owner: "ava" });
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], setlists: [set] });
    expect((await M.ben.sb.from("setlists").select("id").eq("id", set)).data).toHaveLength(1);
    expect((await M.ben.sb.from("setlist_items").select("id").eq("setlist_id", set)).data).toHaveLength(1);
    expect((await M.ben.store.listGigSetlists(gig)).map(s => s.id)).toEqual([set]);
    const edit = await M.ben.sb.from("setlist_items").update({ song: "Hacked" }).eq("setlist_id", set).select("id");
    expect(edit.data ?? []).toEqual([]);
    expect((await M.ben.sb.from("setlist_items").insert({ setlist_id: set, position: 5, song: "x" })).error).toBeTruthy();
    expect((await M.ben.sb.from("setlists").update({ name: "Hacked" }).eq("id", set).select("id")).data ?? []).toEqual([]);
  });

  it("it stops when the setlist is taken off the gig, and an outsider never gets it", async () => {
    const set = await scratchSetlist({ owner: "ava" });
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], setlists: [set] });
    expect((await M.eli.sb.from("setlists").select("id").eq("id", set)).data).toEqual([]);
    await M.ava.store.removeGigSetlist(gig, set);
    expect((await M.ben.sb.from("setlists").select("id").eq("id", set)).data).toEqual([]);
  });

  it("only the gig's editors link setlists, and only ones they own or can edit", async () => {
    const mine = await scratchSetlist({ owner: "ava" });
    const theirs = await scratchSetlist({ owner: "dev", members: { ava: "viewer" } });
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"] });
    await expect(M.ben.store.addGigSetlist(gig, mine)).rejects.toThrow();
    await expect(M.ava.store.addGigSetlist(gig, theirs)).rejects.toThrow(); // a viewer can't hand it to a lineup
    await M.ava.store.addGigSetlist(gig, mine);
    await expect(M.ava.store.addGigSetlist(gig, mine)).rejects.toThrow(/already/);
    expect((await M.ava.store.listGigsOfSetlist(mine)).map(g => g.id)).toEqual([gig]);
    expect(await M.eli.store.listGigsOfSetlist(mine)).toEqual([]);
  });

  it("the same setlist can be on several gigs, and Copy for this gig swaps one link", async () => {
    const set = await scratchSetlist({ owner: "ava" });
    const copy = await scratchSetlist({ owner: "ava" });
    const g1 = await scratchGig({ creator: "ava", setlists: [set] });
    const g2 = await scratchGig({ creator: "ava", setlists: [set] });
    expect((await M.ava.store.listGigsOfSetlist(set)).map(g => g.id).sort()).toEqual([g1, g2].sort());
    await M.ava.store.swapGigSetlist(g1, set, copy);
    expect((await M.ava.store.listGigSetlists(g1)).map(s => s.id)).toEqual([copy]);
    expect((await M.ava.store.listGigSetlists(g2)).map(s => s.id)).toEqual([set]);
    await expect(M.ben.store.swapGigSetlist(g1, copy, set)).rejects.toThrow();
  });
});

describe("lineup and contacts", () => {
  it("people on the gig see the contacts the others share with bands or publicly", async () => {
    const gig = await scratchGig({ creator: "ava", lineup: ["ava", "ben", "cleo"] });
    const seenByAva = await lineupOf(M.ava, gig);
    expect(seenByAva.find(p => p.user_id === USERS.ben.id)?.contact).toEqual({ phone: USERS.ben.contact.phone }); // ben: phone shared with bands
    expect(seenByAva.find(p => p.user_id === USERS.cleo.id)?.contact).toEqual({}); // cleo keeps hers private
    const seenByBen = await lineupOf(M.ben, gig);
    expect(seenByBen.find(p => p.user_id === USERS.ava.id)?.contact).toEqual({ email: USERS.ava.contact.email, website: USERS.ava.contact.website });
  });

  it("a band member who isn't on the lineup sees names but no contacts", async () => {
    const band = await scratchBand(["ava"], ["fay"]);
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], band });
    const seen = await lineupOf(M.fay, gig);
    expect(seen.map(p => p.name)).toEqual(["Ben"]);
    expect(seen[0].contact).toEqual({});
  });

  it("guest phone and email are for the lineup only", async () => {
    const band = await scratchBand(["ava"], ["fay"]);
    const gig = await scratchGig({ creator: "ava", lineup: ["ben"], band });
    await M.ava.store.addGigPerson(gig, { name: "Guest Drummer", plays: "Drums", phone: "+353 1 555 9999", email: "g@example.test" });
    const guest = (m: Musician) => lineupOf(m, gig).then(l => l.find(p => p.user_id === null));
    expect((await guest(M.ava))?.contact).toEqual({ phone: "+353 1 555 9999", email: "g@example.test" });
    expect((await guest(M.ben))?.contact).toEqual({ phone: "+353 1 555 9999", email: "g@example.test" });
    expect((await guest(M.fay))?.contact).toEqual({});
    expect(await lineupOf(M.eli, gig)).toEqual([]);
    // the columns can't be read straight from the table either
    expect((await M.ben.sb.from("gig_lineup").select("guest_phone").eq("gig_id", gig)).error).toBeTruthy();
    expect((await M.fay.sb.from("gig_lineup").select("guest_email").eq("gig_id", gig)).error).toBeTruthy();
    expect((await M.eli.sb.rpc("gig_guest_details", { p_gig: gig })).data ?? []).toEqual([]);
    expect((await M.ben.sb.rpc("gig_guest_details", { p_gig: gig })).data ?? []).toEqual([]); // editors only
    expect((await M.ava.sb.rpc("gig_guest_details", { p_gig: gig })).data).toHaveLength(1);
  });

  it("only editors change the lineup; anyone can leave it", async () => {
    const gig = await scratchGig({ creator: "ava", lineup: ["ben", "cleo"] });
    await expect(M.ben.store.addGigPerson(gig, { userId: USERS.eli.id, plays: "Guitar" })).rejects.toThrow();
    await expect(M.eli.store.addGigPerson(gig, { userId: USERS.eli.id, plays: "Guitar" })).rejects.toThrow();
    await M.ava.store.addGigPerson(gig, { userId: USERS.eli.id, plays: "Guitar" });
    await expect(M.ava.store.addGigPerson(gig, { userId: USERS.eli.id, plays: "Guitar" })).rejects.toThrow(/already/);
    const cleo = (await lineupOf(M.ava, gig)).find(p => p.user_id === USERS.cleo.id);
    const id = ((await admin().from("gig_lineup").select("id").eq("gig_id", gig).eq("user_id", USERS.cleo.id)).data ?? [])[0]?.id as string;
    expect(cleo).toBeTruthy();
    await M.ben.store.removeGigPerson(id); // not ben's row: nothing happens
    expect(await lineupOf(M.ava, gig)).toHaveLength(3);
    await M.cleo.store.removeGigPerson(id); // cleo leaves
    expect(await lineupOf(M.ava, gig)).toHaveLength(2);
  });

  it("being added creates a notification, but not for yourself", async () => {
    const gig = await scratchGig({ creator: "ava" });
    await M.ava.store.addGigPerson(gig, { userId: USERS.ben.id, plays: "Bass" });
    await M.ava.store.addGigPerson(gig, { userId: USERS.ava.id, plays: "Piano" });
    const ben = await M.ben.store.listNotifications();
    expect(ben.find(n => n.kind === "added_to_gig" && n.gigId === gig)?.gigTitle).toBe("Scratch gig");
    expect((await M.ava.store.listNotifications()).some(n => n.gigId === gig)).toBe(false);
  });
});

describe("poster photos", () => {
  it("offers the band's press photos and lineup photos shared with bands or publicly, nothing private", async () => {
    const a = admin();
    const band = await scratchBand(["ava"]);
    const gig = await scratchGig({ creator: "ava", lineup: ["ben", "cleo"], band });
    const pic = (over: object) => ({ kind: "image", name: "p.jpg", mime: "image/jpeg", size: 1, created_by: USERS.ava.id, ...over });
    const bandPic = must(await a.from("attachments").insert(pic({ band_id: band, storage_path: `band/${band}/kit/${crypto.randomUUID()}-p.jpg` })).select("id").single(), "band pic");
    const benPic = must(await a.from("attachments").insert(pic({ profile_id: USERS.ben.id, created_by: USERS.ben.id, storage_path: `user/${USERS.ben.id}/profile/${crypto.randomUUID()}-b.jpg` })).select("id").single(), "ben pic");
    const cleoPic = must(await a.from("attachments").insert(pic({ profile_id: USERS.cleo.id, created_by: USERS.cleo.id, storage_path: `user/${USERS.cleo.id}/profile/${crypto.randomUUID()}-c.jpg` })).select("id").single(), "cleo pic");
    const share = async (w: Who, share: object) => must(await a.from("profiles").update({ share }).eq("id", USERS[w].id), "share");
    const before = { ben: USERS.ben.share, cleo: USERS.cleo.share };
    try {
      await share("ben", { ...USERS.ben.share, ["file:" + benPic.id]: "bands" });
      await share("cleo", { ...USERS.cleo.share, ["file:" + cleoPic.id]: "private" });
      const ids = async (m: Musician) => ((await m.sb.rpc("gig_photos", { p_gig: gig })).data ?? []).map((p: { id: string }) => p.id).sort();
      expect(await ids(M.ben)).toEqual([bandPic.id, benPic.id].sort());
      expect(await ids(M.eli)).toEqual([]);
    } finally {
      await share("ben", before.ben);
      await share("cleo", before.cleo);
      await a.from("attachments").delete().in("id", [bandPic.id, benPic.id, cleoPic.id]);
    }
  });
});
