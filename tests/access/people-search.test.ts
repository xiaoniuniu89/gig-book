// Name picker: search_people() lists only people you already play with, never every user.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, cleanScratch, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });
afterAll(cleanScratch);

/** Forget stored history between eli and everyone so a case starts as strangers. */
const strangers = async () => {
  const a = admin();
  for (const w of ["ava", "ben", "cleo", "dev", "fay"] as Who[]) {
    const [x, y] = [USERS.eli.id, USERS[w].id].sort();
    must(await a.from("collaborations").delete().eq("user_a", x).eq("user_b", y), "forget");
  }
};
const find = async (m: Musician, q: string) => ((await m.sb.rpc("search_people", { q })).data ?? []) as { user_id: string; display_name: string; instruments: string[] }[];

describe("search_people()", () => {
  it("is closed to signed-out callers", async () => {
    const r = await anon().rpc("search_people", { q: "Ava" });
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
  });

  it("a stranger isn't found", async () => {
    await strangers();
    expect(await find(M.eli, "Ava")).toEqual([]);
    expect(await find(M.ava, "Eli")).toEqual([]);
  });

  it("a bandmate is found by part of the name, in any case", async () => {
    await strangers();
    await scratchBand(["eli"], ["fay"]);
    const r = await find(M.eli, "fA");
    expect(r.map(x => x.user_id)).toEqual([USERS.fay.id]);
    expect(Object.keys(r[0]).sort()).toEqual(["display_name", "instruments", "user_id"]);
  });

  it("someone on your setlist is found, and so is the owner from the other side", async () => {
    await strangers();
    await scratchSetlist({ owner: "eli", members: { cleo: "viewer" } });
    expect((await find(M.eli, "cle")).map(x => x.user_id)).toEqual([USERS.cleo.id]);
    expect((await find(M.cleo, "eli")).map(x => x.user_id)).toEqual([USERS.eli.id]);
  });

  it("two people on someone else's setlist find each other", async () => {
    await strangers();
    const set = await scratchSetlist({ owner: "dev", members: { eli: "viewer", fay: "viewer" } });
    expect(set).toBeTruthy();
    expect((await find(M.eli, "fay")).map(x => x.user_id)).toContain(USERS.fay.id);
  });

  it("never lists yourself, and refuses short queries", async () => {
    expect((await find(M.ava, "Ava")).map(x => x.user_id)).not.toContain(USERS.ava.id);
    expect(await find(M.ava, "b")).toEqual([]);
    expect(await find(M.ava, "  ")).toEqual([]);
  });

  it("treats % and _ as plain letters", async () => {
    expect(await find(M.ava, "%%")).toEqual([]);
    expect(await find(M.ava, "__")).toEqual([]);
  });

  it("shows instruments only where they are shared", async () => {
    // ava and ben share the Trio; ben shares instruments with bands, eli shares none.
    await scratchBand(["ava"], ["eli"]);
    expect((await find(M.ava, "ben"))[0].instruments).toEqual(["Bass"]);
    expect((await find(M.ava, "eli"))[0].instruments).toEqual([]);
  });

  it("one-tap add accepts someone from the circle but not a stranger", async () => {
    await cleanScratch(); // the band from the test above would still put ava in eli's circle
    await strangers();
    const set = await scratchSetlist({ owner: "eli" });
    expect((await M.eli.sb.rpc("add_setlist_collaborator", { p_setlist: set, p_user: USERS.ava.id, p_role: "viewer" })).error).toBeTruthy();
    await scratchBand(["eli"], ["ava"]);
    expect((await M.eli.sb.rpc("add_setlist_collaborator", { p_setlist: set, p_user: USERS.ava.id, p_role: "viewer" })).error).toBeNull();
  });
});
