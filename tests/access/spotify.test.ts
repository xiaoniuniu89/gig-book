// Spotify connections (#45): only the signed-in owner can save, read (sealed) or remove their own token; no plain table access.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });
afterAll(async () => { await admin().from("spotify_accounts").delete().in("user_id", [USERS.ava.id, USERS.ben.id]); });

const tokenOf = async (m: Musician) => must(await m.sb.rpc("spotify_token"), "spotify_token") as string | null;

describe("spotify accounts", () => {
  it("each user saves and reads only their own token", async () => {
    must(await M.ava.sb.rpc("spotify_save", { p_token: "sealed-ava" }), "save ava");
    must(await M.ben.sb.rpc("spotify_save", { p_token: "sealed-ben" }), "save ben");
    expect(await tokenOf(M.ava)).toBe("sealed-ava");
    expect(await tokenOf(M.ben)).toBe("sealed-ben");
    expect(await tokenOf(M.cleo)).toBeNull();
    expect(must(await M.cleo.sb.rpc("spotify_connected"))).toBe(false);
    expect(must(await M.ava.sb.rpc("spotify_connected"))).toBe(true);
  });

  it("saving again replaces your own token and nobody else's", async () => {
    must(await M.ben.sb.rpc("spotify_save", { p_token: "sealed-ben-2" }));
    expect(await tokenOf(M.ben)).toBe("sealed-ben-2");
    expect(await tokenOf(M.ava)).toBe("sealed-ava");
  });

  it("the table can't be read or written directly", async () => {
    for (const w of ["ava", "ben"] as Who[]) {
      const r = await M[w].sb.from("spotify_accounts").select("*");
      expect(r.error || (r.data ?? []).length === 0, `${w} select`).toBeTruthy();
      const ins = await M[w].sb.from("spotify_accounts").insert({ user_id: USERS.cleo.id, token: "x" });
      expect(ins.error, `${w} insert`).toBeTruthy();
      const up = await M[w].sb.from("spotify_accounts").update({ token: "x" }).eq("user_id", USERS.ava.id).select("user_id");
      expect(up.error || (up.data ?? []).length === 0, `${w} update`).toBeTruthy();
    }
    const { data } = await admin().from("spotify_accounts").select("user_id");
    expect((data ?? []).map(r => r.user_id)).not.toContain(USERS.cleo.id);
  });

  it("signed out gets nothing", async () => {
    const a = anon();
    expect((await a.rpc("spotify_token")).error).toBeTruthy();
    expect((await a.rpc("spotify_save", { p_token: "x" })).error).toBeTruthy();
    const r = await a.from("spotify_accounts").select("*");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
  });

  it("disconnect removes only your own", async () => {
    must(await M.ben.sb.rpc("spotify_disconnect"));
    expect(await tokenOf(M.ben)).toBeNull();
    expect(await tokenOf(M.ava)).toBe("sealed-ava");
  });
});
