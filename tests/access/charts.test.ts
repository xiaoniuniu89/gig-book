// Charts on a tune (0022): personal charts are the owner's alone; a chart shared with a setlist is readable by
// everyone in it and nobody else; only the owner changes it; the owner or the setlist owner deletes it; files sit
// in the owner's folder of the private `charts` bucket and follow the same rules.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, can, cleanScratch, everyone, must, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
let set: string; // Ava's scratch setlist with Ben as a viewer
const KEY = "scratch tune|nobody";
const made: string[] = [];
const PDF = new Blob(["%PDF-1.1\n%%EOF\n"], { type: "application/pdf" });

/** A chart row (and its file) made by `who` through their own client. */
async function chart(who: Who, setlistId: string | null, name = "Lead sheet") {
  const id = crypto.randomUUID();
  const path = `${USERS[who].id}/${id}/lead.pdf`;
  must(await M[who].sb.storage.from("charts").upload(path, PDF, { contentType: "application/pdf" }), `${who} upload`);
  const row = { id, song_key: KEY, setlist_id: setlistId, name, file_path: path, file_kind: "pdf", file_name: "lead.pdf", file_mime: "application/pdf", file_size: 16 };
  must(await M[who].sb.from("charts").insert(row), `${who} insert`);
  made.push(id);
  return { id, path };
}
const sees = async (who: Who, id: string) => ((await M[who].sb.from("charts").select("id").eq("id", id)).data ?? []).length === 1;
const reads = async (who: Who, path: string) => !(await M[who].sb.storage.from("charts").download(path)).error;

beforeAll(async () => {
  M = await everyone();
  set = await scratchSetlist({ owner: "ava", members: { ben: "viewer" } });
});
afterAll(async () => {
  const a = admin();
  const { data } = await a.from("charts").select("file_path, audio_path").in("id", made);
  const paths = (data ?? []).flatMap(r => [r.file_path, r.audio_path].filter(Boolean)) as string[];
  if (paths.length) await a.storage.from("charts").remove(paths);
  await a.from("charts").delete().in("id", made);
  await cleanScratch();
});

describe("charts", () => {
  it("a personal chart is only its owner's", async () => {
    const c = await chart("ava", null);
    expect(await sees("ava", c.id)).toBe(true);
    expect(await sees("ben", c.id)).toBe(false);
    expect(await reads("ava", c.path)).toBe(true);
    expect(await reads("ben", c.path)).toBe(false);
  });

  it("a chart shared with a setlist is readable by its members only", async () => {
    const c = await chart("ava", set, "Intro");
    expect(await sees("ben", c.id)).toBe(true);
    expect(await reads("ben", c.path)).toBe(true);
    expect(await sees("eli", c.id)).toBe(false);
    expect(await reads("eli", c.path)).toBe(false);
    expect(((await anon().from("charts").select("id").eq("id", c.id)).data ?? []).length).toBe(0);
  });

  it("only members can share with a setlist, and only from their own folder", async () => {
    const id = crypto.randomUUID();
    const row = { id, song_key: KEY, name: "x", file_kind: "pdf", file_name: "x.pdf", file_mime: "application/pdf" };
    expect(can(await M.eli.sb.from("charts").insert({ ...row, setlist_id: set, file_path: `${USERS.eli.id}/${id}/x.pdf` })), "outsider shares").toBe(false);
    expect(can(await M.ben.sb.from("charts").insert({ ...row, setlist_id: set, file_path: `${USERS.ava.id}/${id}/x.pdf` })), "someone else's folder").toBe(false);
    expect(can(await M.ben.sb.from("charts").insert({ ...row, owner: USERS.ava.id, setlist_id: set, file_path: `${USERS.ava.id}/${id}/x.pdf` })), "as someone else").toBe(false);
    expect(can(await M.ben.sb.storage.from("charts").upload(`${USERS.ava.id}/${id}/x.pdf`, PDF, { contentType: "application/pdf" })), "upload to someone else's folder").toBe(false);
  });

  it("only the owner changes a chart; the owner or the setlist owner deletes it", async () => {
    const mine = await chart("ava", set, "Outro");
    const up = await M.ben.sb.from("charts").update({ name: "Hacked" }).eq("id", mine.id).select("id");
    expect((up.data ?? []).length, "ben renames ava's").toBe(0);
    const del = await M.ben.sb.from("charts").delete().eq("id", mine.id).select("id");
    expect((del.data ?? []).length, "ben deletes ava's").toBe(0);
    expect(can(await M.ben.sb.storage.from("charts").remove([mine.path])) && !(await reads("ava", mine.path)), "ben removes ava's file").toBe(false);

    const bens = await chart("ben", set, "Bass part");
    const gone = await M.ava.sb.from("charts").delete().eq("id", bens.id).select("id");
    expect((gone.data ?? []).length, "setlist owner deletes a shared chart").toBe(1);
  });

  it("an owner can't move a chart into a setlist they aren't in", async () => {
    const c = await chart("eli", null);
    const r = await M.eli.sb.from("charts").update({ setlist_id: set }).eq("id", c.id).select("id");
    expect(!r.error && (r.data ?? []).length === 1).toBe(false);
  });
});
