// Recent collaborators: only people you really share history with, never anyone else.
import { beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

/** Forget the stored history between two fake musicians so a case starts from nothing. */
const forget = async (a: Who, b: Who) => {
  const [x, y] = [USERS[a].id, USERS[b].id].sort();
  must(await admin().from("collaborations").delete().eq("user_a", x).eq("user_b", y), "forget");
};
const ids = async (m: Musician) => ((await m.sb.rpc("recent_collaborators")).data ?? []).map((r: { user_id: string }) => r.user_id);

describe("recent_collaborators()", () => {
  it("is closed to signed-out callers and the table is not readable", async () => {
    expect((await anon().rpc("recent_collaborators")).error).toBeTruthy();
    expect((await M.ava.sb.from("collaborations").select("*")).error).toBeTruthy();
  });

  it("an outsider sees no one they never worked with", async () => {
    await forget("eli", "ava");
    expect(await ids(M.eli)).not.toContain(USERS.ava.id);
    expect(await ids(M.ava)).not.toContain(USERS.eli.id);
    expect(await ids(M.eli)).not.toContain(USERS.eli.id);
  });

  it("a current bandmate is listed, with a name only", async () => {
    await forget("eli", "fay");
    await scratchBand(["eli"], ["fay"]);
    expect(await ids(M.eli)).toContain(USERS.fay.id);
    expect(await ids(M.fay)).toContain(USERS.eli.id);
    const row = ((await M.eli.sb.rpc("recent_collaborators")).data ?? []).find((r: { user_id: string }) => r.user_id === USERS.fay.id);
    expect(Object.keys(row).sort()).toEqual(["display_name", "last_at", "user_id"]);
  });

  it("a former bandmate stays listed after leaving or being removed", async () => {
    await forget("eli", "dev");
    const band = await scratchBand(["eli"], ["dev"]);
    must(await M.eli.sb.rpc("band_remove_member", { p_band: band, p_user: USERS.dev.id }), "remove");
    expect((await admin().from("band_members").select("user_id").eq("band_id", band).eq("user_id", USERS.dev.id)).data).toEqual([]);
    expect(await ids(M.eli)).toContain(USERS.dev.id);
    expect(await ids(M.dev)).toContain(USERS.eli.id);
  });

  it("a shared setlist lists the owner and the person it was shared with", async () => {
    await forget("eli", "cleo");
    await scratchSetlist({ owner: "eli", members: { cleo: "viewer" } });
    expect(await ids(M.eli)).toContain(USERS.cleo.id);
    expect(await ids(M.cleo)).toContain(USERS.eli.id);
  });

  it("a removed share is still remembered, and does not list anyone else", async () => {
    await forget("eli", "ben");
    await forget("eli", "fay");
    const set = await scratchSetlist({ owner: "eli", members: { ben: "editor" } });
    await admin().from("setlist_members").delete().eq("setlist_id", set).eq("user_id", USERS.ben.id);
    expect(await ids(M.eli)).toContain(USERS.ben.id);
    // ben and a third person with no history of their own with ben stay unlinked
    await forget("ben", "fay");
    expect(await ids(M.ben)).not.toContain(USERS.fay.id);
  });

  it("newest activity comes first", async () => {
    await forget("eli", "ava");
    await forget("eli", "cleo");
    await scratchSetlist({ owner: "eli", members: { ava: "viewer" } });
    await new Promise(r => setTimeout(r, 20));
    await scratchSetlist({ owner: "eli", members: { cleo: "viewer" } });
    const list = await ids(M.eli);
    expect(list.indexOf(USERS.cleo.id)).toBeLessThan(list.indexOf(USERS.ava.id));
  });
});

describe("add_setlist_collaborator()", () => {
  it("only the owner can add, and only people in their history", async () => {
    await forget("eli", "dev");
    const set = await scratchSetlist({ owner: "eli" });
    const args = { p_setlist: set, p_user: USERS.dev.id, p_role: "viewer" };
    expect((await M.eli.sb.rpc("add_setlist_collaborator", args)).error).toBeTruthy(); // a stranger
    await scratchBand(["eli"], ["dev"]);
    expect((await M.dev.sb.rpc("add_setlist_collaborator", args)).error).toBeTruthy(); // not the owner
    must(await M.eli.sb.rpc("add_setlist_collaborator", args), "add");
    const got = (await admin().from("setlist_members").select("role").eq("setlist_id", set).eq("user_id", USERS.dev.id).single()).data;
    expect(got?.role).toBe("viewer");
  });
});
