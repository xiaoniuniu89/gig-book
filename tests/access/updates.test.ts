// Opt-in updates in the bell, and iReal charts made for a setlist's copy of a tune (migration 0050).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, cleanScratch, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const gigs: string[] = [];
afterAll(async () => {
  if (gigs.length) await admin().from("gigs").delete().in("id", gigs);
  await admin().from("library_playlists").delete().eq("name", "Scratch");
  await admin().from("update_subscriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin().from("notifications").delete().in("kind", ["gig_update", "band_update", "added_to_gig"]);
  await cleanScratch();
});

async function gigWith(creator: Who, lineup: Who[], setlist?: string): Promise<string> {
  const a = admin(), id = crypto.randomUUID();
  gigs.push(id);
  must(await a.from("gigs").insert({ id, created_by: USERS[creator].id, title: "Scratch gig", gig_date: "2030-01-01" }), "gig");
  if (lineup.length) must(await a.from("gig_lineup").insert(lineup.map(w => ({ gig_id: id, user_id: USERS[w].id, plays: "x" }))), "lineup");
  if (setlist) must(await a.from("gig_setlists").insert({ gig_id: id, setlist_id: setlist, position: 0 }), "link");
  return id;
}
const updates = async (m: Musician, gig: string) => ((await m.sb.from("notifications").select("payload").eq("kind", "gig_update")).data ?? [])
  .filter((r: { payload: { gig_id?: string } }) => r.payload.gig_id === gig);
const fields = (notes: string) => ({ title: "Scratch gig", date: "2030-01-01", time: "", venue: "", address: "", schedule: "", notes, bandId: null });

describe("opting in to updates", () => {
  it("nobody hears anything until they opt in", async () => {
    const gig = await gigWith("ava", ["ben"]);
    await M.ava.store.updateGig(gig, fields("one"));
    expect(await updates(M.ben, gig)).toEqual([]);
  });

  it("the gig's checkbox opts you in, and not the person who made the change", async () => {
    const gig = await gigWith("ava", ["ben"]);
    await M.ben.store.setUpdateSub({ gigId: gig }, true);
    await M.ava.store.setUpdateSub({ gigId: gig }, true);
    await M.ava.store.updateGig(gig, fields("two"));
    expect(await updates(M.ben, gig)).toHaveLength(1);
    expect(await updates(M.ava, gig)).toEqual([]);
  });

  it("folds repeats while the last one is unread", async () => {
    const gig = await gigWith("ava", ["ben"]);
    await M.ben.store.setUpdateSub({ gigId: gig }, true);
    await M.ava.store.updateGig(gig, fields("a"));
    await M.ava.store.updateGig(gig, fields("b"));
    expect(await updates(M.ben, gig)).toHaveLength(1);
  });

  it("the Settings switch covers everything you're on, and goes off again", async () => {
    const gig = await gigWith("ava", ["cleo"]);
    await M.cleo.store.setUpdateSub({}, true);
    expect((await M.cleo.store.listUpdateSubs()).all).toBe(true);
    await M.ava.store.updateGig(gig, fields("c"));
    expect(await updates(M.cleo, gig)).toHaveLength(1);
    await M.cleo.store.setUpdateSub({}, false);
    expect((await M.cleo.store.listUpdateSubs()).all).toBe(false);
  });

  it("the Settings switch tells nobody about gigs they aren't on", async () => {
    const gig = await gigWith("ava", []);
    await M.eli.store.setUpdateSub({}, true);
    await M.ava.store.updateGig(gig, fields("d"));
    expect(await updates(M.eli, gig)).toEqual([]);
    await M.eli.store.setUpdateSub({}, false);
  });

  it("you can't opt in to a gig you can't read, or for someone else, or see their choices", async () => {
    const gig = await gigWith("ava", ["ben"]);
    await expect(M.eli.store.setUpdateSub({ gigId: gig }, true)).rejects.toThrow();
    expect((await M.eli.sb.from("update_subscriptions").insert({ user_id: USERS.ben.id, gig_id: gig })).error).toBeTruthy();
    await M.ben.store.setUpdateSub({ gigId: gig }, true);
    expect((await M.eli.sb.from("update_subscriptions").select("id").eq("gig_id", gig)).data).toEqual([]);
  });
});

describe("making a chart for a setlist's tune", () => {
  const OLD = "Scratch Tune=Ava Musician==Medium Swing=C=n=old=0=0";
  const NEW = "Scratch Tune=Ava Musician==Medium Swing=C=n=new=0=0";
  async function tune(owner: Who, members?: Partial<Record<Who, "viewer" | "editor">>) {
    const set = await scratchSetlist({ owner, members });
    const item = crypto.randomUUID();
    must(await admin().from("setlist_items").insert({ id: item, setlist_id: set, position: 90, set_no: 1, song: OLD }), "item");
    return { set, item };
  }
  const song = async (item: string) => (must(await admin().from("setlist_items").select("song").eq("id", item).single(), "song") as { song: string }).song;

  it("people on the gig can, by default", async () => {
    const { set, item } = await tune("ava");
    await gigWith("ava", ["ben"], set);
    expect(await M.ben.store.canChartSetlist(set)).toBe(true);
    await M.ben.store.setItemChart(set, item, NEW);
    expect(await song(item)).toBe(NEW);
  });

  it("not when the gig turns it off, and a setlist viewer still can't", async () => {
    const { set, item } = await tune("ava", { cleo: "viewer" });
    const gig = await gigWith("ava", ["ben"], set);
    must(await admin().from("gigs").update({ lineup_can_chart: false }).eq("id", gig), "off");
    expect(await M.ben.store.canChartSetlist(set)).toBe(false);
    await expect(M.ben.store.setItemChart(set, item, NEW)).rejects.toThrow();
    await expect(M.cleo.store.setItemChart(set, item, NEW)).rejects.toThrow();
    expect(await song(item)).toBe(OLD);
  });

  it("an outsider can't, and an editor can", async () => {
    const { set, item } = await tune("ava", { dev: "editor" });
    expect(await M.eli.store.canChartSetlist(set)).toBe(false);
    await expect(M.eli.store.setItemChart(set, item, NEW)).rejects.toThrow();
    await M.dev.store.setItemChart(set, item, NEW);
    expect(await song(item)).toBe(NEW);
  });

  it("can't turn it into a different tune", async () => {
    const { set, item } = await tune("ava");
    await expect(M.ava.store.setItemChart(set, item, "Other=Ava Musician==Medium Swing=C=n=new=0=0")).rejects.toThrow();
    await expect(M.ava.store.setItemChart(set, item, "Scratch Tune=Someone==Medium Swing=C=n=new=0=0")).rejects.toThrow();
    expect(await song(item)).toBe(OLD);
  });

  it("the gig's editors change the setting, others can't", async () => {
    const gig = await gigWith("ava", ["ben"]);
    await expect(M.ben.store.updateGig(gig, { ...fields(""), lineupCharts: false })).rejects.toThrow();
    await M.ava.store.updateGig(gig, { ...fields(""), lineupCharts: false });
    expect((await M.ava.store.getGig(gig))?.lineupCharts).toBe(false);
  });
});

describe("sharing a library playlist", () => {
  const SONGS = ["Scratch Tune=Ava Musician==Medium Swing=C=n=x=0=0"];
  async function playlist() {
    const id = crypto.randomUUID();
    await M.ava.store.saveLibraryPlaylist({ id, name: "Scratch", songs: SONGS });
    return id;
  }
  it("is private until you share it", async () => {
    const id = await playlist();
    expect(await M.eli.store.getSharedPlaylist(id)).toBeNull();
    expect((await M.ava.store.getSharedPlaylist(id))?.mine).toBe(true);
  });
  it("public opens by its link, but never lands in anyone else's library", async () => {
    const id = await playlist();
    await M.ava.store.setLibraryVisibility(id, "public");
    const got = await M.eli.store.getSharedPlaylist(id);
    expect(got?.songs).toEqual(SONGS);
    expect(got?.mine).toBe(false);
    expect((await M.eli.store.listLibrary()).map(p => p.id)).not.toContain(id);
  });
  it("re-saving keeps the choice, and only the owner can change it or the tunes", async () => {
    const id = await playlist();
    await M.ava.store.setLibraryVisibility(id, "public");
    await M.ava.store.saveLibraryPlaylist({ id, name: "Scratch", songs: SONGS });
    expect((await M.ava.store.getSharedPlaylist(id))?.visibility).toBe("public");
    await expect(M.eli.store.setLibraryVisibility(id, "private")).rejects.toThrow();
    await expect(M.eli.store.saveLibraryPlaylist({ id, name: "Mine now", songs: [] })).rejects.toThrow();
    await expect(M.eli.store.deleteLibraryPlaylist(id)).resolves.toBeUndefined();
    expect((await M.ava.store.getSharedPlaylist(id))?.name).toBe("Scratch");
  });
  it("bands I'm in reaches bandmates only", async () => {
    const id = await playlist();
    const band = await scratchBand(["ava"], ["ben"]);
    await M.ava.store.setLibraryVisibility(id, "bands");
    expect((await M.ben.store.getSharedPlaylist(id))?.name).toBe("Scratch");
    expect(await M.eli.store.getSharedPlaylist(id)).toBeNull();
    expect(band).toBeTruthy();
  });
});
