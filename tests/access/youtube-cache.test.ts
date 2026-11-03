// youtube_cache: signed-in users read and add; nobody changes or deletes; signed-out visitors see nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const KEY = "test song|test composer";
beforeAll(async () => { M = await everyone(); await admin().from("youtube_cache").delete().eq("key", KEY); });
afterAll(async () => { await admin().from("youtube_cache").delete().eq("key", KEY); });

describe("youtube_cache", () => {
  it("lets a signed-in user add a pick, and everyone signed in read it", async () => {
    const ins = await M.ava.sb.from("youtube_cache").insert({ key: KEY, video_id: "dQw4w9WgXcQ", title: "Test" });
    expect(ins.error).toBeNull();
    const seen = await M.ben.sb.from("youtube_cache").select("video_id").eq("key", KEY);
    expect(seen.data).toEqual([{ video_id: "dQw4w9WgXcQ" }]);
  });

  it("keeps the first pick: no overwrite, no second row for the same song", async () => {
    const dup = await M.ben.sb.from("youtube_cache").insert({ key: KEY, video_id: "aaaaaaaaaaa", title: "Other" });
    expect(dup.error).toBeTruthy();
    const upd = await M.ben.sb.from("youtube_cache").update({ video_id: "aaaaaaaaaaa" }).eq("key", KEY).select("key");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await M.ava.sb.from("youtube_cache").delete().eq("key", KEY).select("key");
    expect(del.data ?? []).toHaveLength(0);
    const { data } = await admin().from("youtube_cache").select("video_id").eq("key", KEY).single();
    expect(data?.video_id).toBe("dQw4w9WgXcQ");
  });

  it("rejects a bad video id and a row made in someone else's name", async () => {
    const bad = await M.ava.sb.from("youtube_cache").insert({ key: KEY + "2", video_id: "not an id", title: "" });
    expect(bad.error).toBeTruthy();
    const forged = await M.ava.sb.from("youtube_cache").insert({ key: KEY + "3", video_id: "dQw4w9WgXcQ", title: "", created_by: USERS.ben.id });
    expect(forged.error).toBeTruthy();
  });

  it("is closed to signed-out visitors", async () => {
    const r = await anon().from("youtube_cache").select("key");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
    const w = await anon().from("youtube_cache").insert({ key: KEY + "4", video_id: "dQw4w9WgXcQ", title: "" });
    expect(w.error).toBeTruthy();
  });
});
