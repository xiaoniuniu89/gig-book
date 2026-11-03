// tune_versions (migration 0028): everyone signed in reads; you add community versions as yourself (10 a day); authors edit and
// delete their own; anyone may fix and check an AI version; the AI runs once per tune, ever (claim_tune_versions).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const KEY = "version test tune|version test composer";
const CH = "| Cm7 | F7 | Bbmaj7 | Bbmaj7 |";
// the AI tests use eli and fay for claims so their ai_usage doesn't race with ai.test.ts (ava, ben)
const clear = async () => {
  await admin().from("tune_versions").delete().like("song_key", "version test tune%");
  await admin().from("tune_version_claims").delete().like("song_key", "version test tune%");
  await admin().from("ai_usage").delete().in("user_id", [USERS.eli.id, USERS.fay.id]);
};
beforeAll(async () => { M = await everyone(); await clear(); });
afterAll(clear);

describe("community versions", () => {
  it("are added as yourself and read by everyone signed in, not by signed-out visitors", async () => {
    const ins = await M.ava.sb.from("tune_versions").insert({ song_key: KEY, name: "My changes", changes: CH, source: "community" }).select("id, created_by").single();
    expect(ins.error).toBeNull();
    expect(ins.data?.created_by).toBe(USERS.ava.id);
    const seen = await M.ben.sb.from("tune_versions").select("name").eq("song_key", KEY);
    expect(seen.data).toEqual([{ name: "My changes" }]);
    const out = await anon().from("tune_versions").select("id");
    expect(out.error || (out.data ?? []).length === 0).toBeTruthy();
  });

  it("can't be forged: not as the AI, not in another name, not with a long name", async () => {
    const ai = await M.ava.sb.from("tune_versions").insert({ song_key: KEY, name: "Fake", changes: CH, source: "ai" });
    expect(ai.error).toBeTruthy();
    const forged = await M.ava.sb.from("tune_versions").insert({ song_key: KEY, name: "Fake", changes: CH, source: "community", created_by: USERS.ben.id });
    expect(forged.error).toBeTruthy();
    const long = await M.ava.sb.from("tune_versions").insert({ song_key: KEY, name: "x".repeat(61), changes: CH, source: "community" });
    expect(long.error).toBeTruthy();
  });

  it("can be changed and deleted only by the author", async () => {
    const id = must(await M.ava.sb.from("tune_versions").select("id").eq("song_key", KEY).eq("created_by", USERS.ava.id).limit(1).single()).id;
    const other = await M.ben.sb.from("tune_versions").update({ changes: "| C | C | C | C |" }).eq("id", id).select("id");
    expect(other.data ?? []).toHaveLength(0);
    const del = await M.ben.sb.from("tune_versions").delete().eq("id", id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const mine = await M.ava.sb.from("tune_versions").update({ name: "Renamed", changes: "| C | C | C | C |" }).eq("id", id).select("id");
    expect(mine.data).toHaveLength(1);
    const moved = await M.ava.sb.from("tune_versions").update({ song_key: KEY + "2" }).eq("id", id).select("id");
    expect(moved.error).toBeTruthy();
    const gone = await M.ava.sb.from("tune_versions").delete().eq("id", id).select("id");
    expect(gone.data).toHaveLength(1);
  });

  it("stop at 10 new versions a day each", async () => {
    const K = "version test tune limit|x";
    for (let i = 0; i < 10; i++) expect((await M.cleo.sb.from("tune_versions").insert({ song_key: K, name: "v" + i, changes: CH, source: "community" })).error).toBeNull();
    const over = await M.cleo.sb.from("tune_versions").insert({ song_key: K, name: "one too many", changes: CH, source: "community" });
    expect(over.error?.message).toContain("version_limit");
    expect((await M.dev.sb.from("tune_versions").insert({ song_key: K, name: "dev is fine", changes: CH, source: "community" })).error).toBeNull();
  });
});

describe("AI versions", () => {
  const K = "version test tune ai|y";
  it("are claimed once per tune: the second caller is told no, and the claim counts as a Niu AI request", async () => {
    expect(must(await M.eli.sb.rpc("claim_tune_versions", { p_song_key: K }))).toBe(true);
    expect(must(await M.fay.sb.rpc("claim_tune_versions", { p_song_key: K }))).toBe(false);
    expect(must(await M.eli.sb.rpc("claim_tune_versions", { p_song_key: K }))).toBe(false);
    expect(must(await M.eli.sb.rpc("ai_remaining"))).toBe(9);
    expect(must(await M.fay.sb.rpc("ai_remaining"))).toBe(10);
  });

  it("are saved only by whoever holds the claim, at most 3, and then can't be refilled", async () => {
    const vs = [1, 2, 3, 4].map(i => ({ name: "Player " + i, changes: CH }));
    expect((await M.fay.sb.rpc("add_ai_tune_versions", { p_song_key: K, p_versions: vs })).error).toBeTruthy();
    expect(must(await M.eli.sb.rpc("add_ai_tune_versions", { p_song_key: K, p_versions: vs }))).toBe(3);
    expect((await M.eli.sb.rpc("add_ai_tune_versions", { p_song_key: K, p_versions: vs })).error).toBeTruthy();
    const rows = must(await M.fay.sb.from("tune_versions").select("source, checked_by").eq("song_key", K));
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.source === "ai" && r.checked_by === null)).toBe(true);
    expect(must(await M.fay.sb.from("tune_version_claims").select("song_key").eq("song_key", K))).toHaveLength(1);
  });

  it("can't be released once they have versions, and nobody can delete them", async () => {
    await M.eli.sb.rpc("release_tune_versions", { p_song_key: K });
    expect(must(await M.eli.sb.rpc("claim_tune_versions", { p_song_key: K }))).toBe(false);
    const del = await M.eli.sb.from("tune_versions").delete().eq("song_key", K).select("id");
    expect(del.data ?? []).toHaveLength(0);
  });

  it("can be fixed and checked by anyone signed in, who is recorded as the checker", async () => {
    const ids = must(await M.ben.sb.from("tune_versions").select("id").eq("song_key", K).order("created_at")).map(r => r.id as string);
    const fix = await M.ben.sb.from("tune_versions").update({ changes: "| Dm7 | G7 | Cmaj7 | Cmaj7 |" }).eq("id", ids[0]).select("checked_by");
    expect(fix.data).toEqual([{ checked_by: USERS.ben.id }]);
    const forged = await M.dev.sb.from("tune_versions").update({ checked_by: USERS.ben.id }).eq("id", ids[1]).select("checked_by");
    expect(forged.data).toEqual([{ checked_by: USERS.dev.id }]);
    const rename = await M.dev.sb.from("tune_versions").update({ name: "Mine now" }).eq("id", ids[2]).select("id");
    expect(rename.error).toBeTruthy();
  });

  it("is given back when the model failed, so someone can try again", async () => {
    const K2 = "version test tune ai|retry";
    expect(must(await M.fay.sb.rpc("claim_tune_versions", { p_song_key: K2 }))).toBe(true);
    await M.fay.sb.rpc("release_tune_versions", { p_song_key: K2 });
    expect(must(await M.eli.sb.rpc("claim_tune_versions", { p_song_key: K2 }))).toBe(true);
  });
});
