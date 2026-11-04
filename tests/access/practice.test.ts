// Transcribe recordings (0036): your own rows and files only, at most 3 each, and a file can only be uploaded
// to a path one of your rows names.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const MP3 = new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])], { type: "audio/mpeg" });

/** A row and its file, made by `who` through their own client. */
async function track(who: Who, name = "solo.mp3") {
  const id = crypto.randomUUID(), path = `${USERS[who].id}/${id}/${name}`;
  const ins = await M[who].sb.from("practice_tracks").insert({ id, name, storage_path: path, mime: "audio/mpeg", size: MP3.size });
  if (ins.error) return { id, path, error: ins.error };
  must(await M[who].sb.storage.from("practice").upload(path, MP3, { contentType: "audio/mpeg" }), `${who} upload`);
  return { id, path, error: null };
}
async function clear(who: Who) {
  const a = admin();
  const { data } = await a.from("practice_tracks").select("storage_path").eq("owner", USERS[who].id);
  const paths = (data ?? []).map(r => r.storage_path as string);
  if (paths.length) await a.storage.from("practice").remove(paths);
  await a.from("practice_tracks").delete().eq("owner", USERS[who].id);
}

beforeAll(async () => { M = await everyone(); await clear("ava"); await clear("ben"); });
afterAll(async () => { await clear("ava"); await clear("ben"); });

describe("practice tracks", () => {
  it("the owner lists, plays and deletes their own; nobody else sees them", async () => {
    const t = await track("ava");
    expect(t.error).toBeNull();
    expect((await M.ava.store.listPracticeTracks()).map(x => x.id)).toContain(t.id);
    expect(await M.ava.store.practiceTrackUrl({ id: t.id, name: "", mime: "", size: 0, createdAt: "" })).toMatch(/^http/);
    expect((await M.ben.store.listPracticeTracks()).some(x => x.id === t.id)).toBe(false);
    expect((await M.ben.sb.storage.from("practice").download(t.path)).error).toBeTruthy();
    const del = await M.ben.sb.from("practice_tracks").delete().eq("id", t.id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    await M.ava.store.deletePracticeTrack({ id: t.id, name: "", mime: "", size: 0, createdAt: "" });
    expect((await M.ava.store.listPracticeTracks()).some(x => x.id === t.id)).toBe(false);
  });

  it("keeps at most 3 each", async () => {
    await clear("ava");
    for (let i = 0; i < 3; i++) expect((await track("ava", `t${i}.mp3`)).error).toBeNull();
    const fourth = await track("ava", "t3.mp3");
    expect(fourth.error?.message).toMatch(/3 recordings/);
    // Ben's count is his own
    expect((await track("ben")).error).toBeNull();
  });

  it("can't upload a file without a row, or into someone else's folder, or make a row for someone else", async () => {
    const stray = `${USERS.ava.id}/${crypto.randomUUID()}/stray.mp3`;
    expect((await M.ava.sb.storage.from("practice").upload(stray, MP3, { contentType: "audio/mpeg" })).error).toBeTruthy();
    const theirs = `${USERS.ben.id}/${crypto.randomUUID()}/x.mp3`;
    expect((await M.ava.sb.storage.from("practice").upload(theirs, MP3, { contentType: "audio/mpeg" })).error).toBeTruthy();
    const id = crypto.randomUUID();
    const planted = await M.ava.sb.from("practice_tracks").insert({ id, owner: USERS.ben.id, name: "x", storage_path: `${USERS.ben.id}/${id}/x.mp3`, mime: "audio/mpeg", size: 1 });
    expect(planted.error).toBeTruthy();
  });
});
