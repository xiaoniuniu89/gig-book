// Recordings on a setlist's tune (0054): readers play, editors add, the uploader or the setlist's owner removes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, cleanScratch, everyone, must, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
let set: string;
const KEY = "scratch|tune";
const MP3 = new Blob(["ID3"], { type: "audio/mpeg" });
let n = 0;
const add = (who: Who, setlist = set, key = KEY) => {
  const path = `${USERS[who].id}/${setlist}/take-${Date.now()}-${++n}.mp3`;
  return M[who].sb.from("setlist_recordings").insert({ setlist_id: setlist, song_key: key, path, name: "take.mp3", mime: "audio/mpeg", size: MP3.size }).select("path").then(r => ({ ...r, path }));
};
const put = (who: Who, path: string) => M[who].sb.storage.from("setlist-recordings").upload(path, MP3, { contentType: "audio/mpeg" });
const canPlay = async (who: Who, path: string) => !(await M[who].sb.storage.from("setlist-recordings").download(path)).error;
const clearLog = () => admin().from("original_upload_log").delete().in("owner", [USERS.ava.id, USERS.ben.id, USERS.cleo.id]);

beforeAll(async () => {
  M = await everyone();
  await cleanScratch();
  await clearLog();
  set = await scratchSetlist({ owner: "ava", members: { ben: "editor", cleo: "viewer" } });
});
afterAll(async () => {
  const { data } = await admin().from("setlist_recordings").select("path").eq("setlist_id", set);
  if (data?.length) await admin().storage.from("setlist-recordings").remove(data.map(r => r.path as string));
  await cleanScratch();
  await clearLog();
});

describe("setlist recordings", () => {
  it("an editor adds one and readers play it; outsiders and signed-out can't", async () => {
    const r = await add("ben");
    expect(r.error).toBeNull();
    must(await put("ben", r.path), "ben upload");
    expect(await canPlay("ava", r.path)).toBe(true);
    expect(await canPlay("cleo", r.path)).toBe(true);
    expect(await canPlay("eli", r.path)).toBe(false);
    expect(must(await M.eli.sb.from("setlist_recordings").select("id").eq("path", r.path), "eli reads")).toHaveLength(0);
    expect((await anon().storage.from("setlist-recordings").download(r.path)).error).toBeTruthy();
  });

  it("a viewer or an outsider can't add one, nor can anyone use someone else's folder", async () => {
    expect((await add("cleo")).error).toBeTruthy();
    expect((await add("eli")).error).toBeTruthy();
    const other = await M.ben.sb.from("setlist_recordings").insert({ setlist_id: set, song_key: KEY, path: `${USERS.ava.id}/${set}/x.mp3`, name: "x.mp3", mime: "audio/mpeg", size: 1 });
    expect(other.error).toBeTruthy();
    expect((await put("eli", `${USERS.eli.id}/${set}/stray.mp3`)).error).toBeTruthy();
  });

  it("only the uploader or the setlist's owner removes one", async () => {
    const r = await add("ben");
    must(await put("ben", r.path), "ben upload");
    expect(must(await M.cleo.sb.from("setlist_recordings").delete().eq("path", r.path).select("id"), "cleo")).toHaveLength(0);
    await M.ava.sb.storage.from("setlist-recordings").remove([r.path]);
    expect(await canPlay("ben", r.path)).toBe(false);
    expect(must(await M.ava.sb.from("setlist_recordings").delete().eq("path", r.path).select("id"), "ava")).toHaveLength(1);
  });

  it("a tune holds 10 at most", async () => {
    await clearLog();
    const key = "scratch|full";
    for (let k = 0; k < 10; k++) expect((await add("ava", set, key)).error).toBeNull();
    expect((await add("ava", set, key)).error?.message).toMatch(/already has 10/);
  });
});
