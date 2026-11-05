// Transcriptions (0038): private to the owner and the people they share with, or public to anyone signed in; only the
// owner changes or deletes; files follow the row's rules and can only go to a path one of your rows names; 20 a day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { MEMBER_NOT_FOUND } from "@/lib/data/types";
import { admin, anon, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const PDF = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });

/** A row and its file, made by `who` through their own client. */
async function make(who: Who, o: { visibility?: "private" | "public"; songKey?: string | null } = {}) {
  const id = crypto.randomUUID(), path = `${USERS[who].id}/${id}/solo.pdf`;
  const ins = await M[who].sb.from("transcriptions").insert({
    id, title: "Solo", song_key: o.songKey ?? null, visibility: o.visibility ?? "private",
    file_path: path, file_kind: "pdf", file_name: "solo.pdf", file_mime: "application/pdf", file_size: PDF.size,
  });
  if (ins.error) return { id, path, error: ins.error };
  must(await M[who].sb.storage.from("transcriptions").upload(path, PDF, { contentType: "application/pdf" }), `${who} upload`);
  return { id, path, error: null };
}
async function clear(who: Who) {
  const a = admin();
  const { data } = await a.from("transcriptions").select("file_path").eq("owner", USERS[who].id);
  const paths = (data ?? []).map(r => r.file_path as string);
  if (paths.length) await a.storage.from("transcriptions").remove(paths);
  await a.from("transcriptions").delete().eq("owner", USERS[who].id);
  await a.from("transcription_upload_log").delete().eq("owner", USERS[who].id);
}
const visible = async (who: Who, id: string) => (await M[who].sb.from("transcriptions").select("id").eq("id", id)).data?.length === 1;
const canDownload = async (who: Who, path: string) => !(await M[who].sb.storage.from("transcriptions").download(path)).error;

beforeAll(async () => { M = await everyone(); for (const w of ["ava", "ben", "cleo", "dev"] as Who[]) await clear(w); });
afterAll(async () => { for (const w of ["ava", "ben", "cleo", "dev"] as Who[]) await clear(w); });

describe("transcriptions: who can see one", () => {
  it("private: the owner only, row and file", async () => {
    const t = await make("ava");
    expect(t.error).toBeNull();
    expect(await visible("ava", t.id)).toBe(true);
    expect(await canDownload("ava", t.path)).toBe(true);
    expect(await visible("ben", t.id)).toBe(false);
    expect(await canDownload("ben", t.path)).toBe(false);
    expect(await M.ben.store.getTranscription(t.id)).toBeNull();
    expect((await anon().from("transcriptions").select("id")).data ?? []).toHaveLength(0);
  });

  it("public: anyone signed in, not signed out", async () => {
    const t = await make("ava", { visibility: "public" });
    expect(await visible("ben", t.id)).toBe(true);
    expect(await canDownload("ben", t.path)).toBe(true);
    expect((await anon().from("transcriptions").select("id").eq("id", t.id)).data ?? []).toHaveLength(0);
    expect((await anon().storage.from("transcriptions").download(t.path)).error).toBeTruthy();
    // switching it back to private hides it again
    must(await M.ava.sb.from("transcriptions").update({ visibility: "private" }).eq("id", t.id), "make private");
    expect(await visible("ben", t.id)).toBe(false);
  });

  it("shared: the people it is shared with, until they or the owner remove them", async () => {
    const t = await make("ava");
    expect((await M.ava.sb.rpc("add_transcription_share", { p_id: t.id, p_email: USERS.ben.email })).error).toBeNull();
    expect(await visible("ben", t.id)).toBe(true);
    expect(await canDownload("ben", t.path)).toBe(true);
    expect(await visible("cleo", t.id)).toBe(false);
    // the owner sees who; the shared person only sees their own row
    expect((await M.ava.store.listTranscriptionShares(t.id)).map(s => s.userId)).toEqual([USERS.ben.id]);
    expect((await M.ben.sb.rpc("transcription_share_list", { p_id: t.id })).error).toBeTruthy();
    expect((await M.ben.sb.from("transcription_shares").select("user_id").eq("transcription_id", t.id)).data).toHaveLength(1);
    // listed under "Shared with me" for Ben only
    const q = { q: "", instrument: "", tab: "shared" as const, sort: "az" as const, page: 0, perPage: 20 };
    expect((await M.ben.store.listTranscriptions(q)).items.map(x => x.id)).toContain(t.id);
    expect((await M.cleo.store.listTranscriptions(q)).items.map(x => x.id)).not.toContain(t.id);
    // Ben removes himself
    await M.ben.store.removeTranscriptionShare(t.id, USERS.ben.id);
    expect(await visible("ben", t.id)).toBe(false);
    // the owner removes someone
    await M.ava.store.addTranscriptionShare(t.id, USERS.cleo.email);
    expect(await visible("cleo", t.id)).toBe(true);
    await M.ava.store.removeTranscriptionShare(t.id, USERS.cleo.id);
    expect(await visible("cleo", t.id)).toBe(false);
  });

  it("only the owner shares, and an unknown email says so", async () => {
    const t = await make("ava", { visibility: "public" });
    expect((await M.ben.sb.rpc("add_transcription_share", { p_id: t.id, p_email: USERS.cleo.email })).error).toBeTruthy();
    expect((await M.ben.sb.from("transcription_shares").insert({ transcription_id: t.id, user_id: USERS.ben.id })).error).toBeTruthy();
    await expect(M.ava.store.addTranscriptionShare(t.id, "nobody@nowhere.test")).rejects.toThrow(MEMBER_NOT_FOUND);
    expect((await M.ava.sb.rpc("add_transcription_share", { p_id: t.id, p_email: USERS.ava.email })).error).toBeTruthy();
  });

  it("a shared person can't remove someone else's share", async () => {
    const t = await make("ava");
    await M.ava.store.addTranscriptionShare(t.id, USERS.ben.email);
    await M.ava.store.addTranscriptionShare(t.id, USERS.cleo.email);
    await M.ben.sb.from("transcription_shares").delete().eq("transcription_id", t.id).eq("user_id", USERS.cleo.id);
    expect(await visible("cleo", t.id)).toBe(true);
  });
});

describe("transcriptions: changing and deleting", () => {
  it("only the owner updates or deletes, even a public one", async () => {
    const t = await make("ava", { visibility: "public" });
    const up = await M.ben.sb.from("transcriptions").update({ title: "Mine now" }).eq("id", t.id).select("id");
    expect(up.data ?? []).toHaveLength(0);
    const del = await M.ben.sb.from("transcriptions").delete().eq("id", t.id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    expect((await M.ben.sb.storage.from("transcriptions").remove([t.path])).data ?? []).toHaveLength(0);
    expect(await canDownload("ava", t.path)).toBe(true);
    // the owner can't hand it to someone else or point it at another folder
    expect((await M.ava.sb.from("transcriptions").update({ owner: USERS.ben.id }).eq("id", t.id)).error).toBeTruthy();
    const moved = await M.ava.sb.from("transcriptions").update({ file_path: `${USERS.ben.id}/${t.id}/x.pdf` }).eq("id", t.id).select("id");
    expect(moved.data ?? []).toHaveLength(0);
    // the owner deletes: row and file go
    const own = await M.ava.store.getTranscription(t.id);
    await M.ava.store.deleteTranscription(own!);
    expect(await visible("ava", t.id)).toBe(false);
    expect(await canDownload("ava", t.path)).toBe(false);
  });

  it("lists a page at a time, with search, instrument and tune filters", async () => {
    await clear("dev");
    const a = admin();
    const rows = ["Blue Bossa", "All The Things", "Autumn Leaves"].map((title, i) => ({
      id: crypto.randomUUID(), owner: USERS.dev.id, title, song_key: i === 0 ? "blue bossa|kenny dorham" : null, tune_title: title, player: i === 1 ? "Parker" : "",
      instrument: i === 0 ? "Tenor sax" : "Piano", visibility: "private", file_path: `${USERS.dev.id}/x${i}/a.pdf`, file_kind: "pdf", file_name: "a.pdf", file_mime: "application/pdf", file_size: 1,
    }));
    must(await a.from("transcriptions").insert(rows), "seed");
    const base = { q: "", instrument: "", tab: "mine" as const, sort: "az" as const, page: 0, perPage: 2 };
    const p1 = await M.dev.store.listTranscriptions(base);
    expect(p1.total).toBe(3);
    expect(p1.items.map(x => x.title)).toEqual(["All The Things", "Autumn Leaves"]);
    expect((await M.dev.store.listTranscriptions({ ...base, page: 1 })).items.map(x => x.title)).toEqual(["Blue Bossa"]);
    expect((await M.dev.store.listTranscriptions({ ...base, q: "parker" })).items.map(x => x.title)).toEqual(["All The Things"]);
    expect((await M.dev.store.listTranscriptions({ ...base, instrument: "Tenor sax" })).items.map(x => x.title)).toEqual(["Blue Bossa"]);
    expect((await M.dev.store.listTranscriptions({ ...base, songKey: "blue bossa|kenny dorham" })).total).toBe(1);
    // a search with commas or percent signs can't break the filter
    expect((await M.dev.store.listTranscriptions({ ...base, q: "a,b%(c)" })).total).toBe(0);
    await clear("dev");
  });
});

describe("transcriptions: files and the daily cap", () => {
  it("can't upload without a row, into someone else's folder, or make a row for someone else", async () => {
    const stray = `${USERS.ava.id}/${crypto.randomUUID()}/stray.pdf`;
    expect((await M.ava.sb.storage.from("transcriptions").upload(stray, PDF, { contentType: "application/pdf" })).error).toBeTruthy();
    const theirs = `${USERS.ben.id}/${crypto.randomUUID()}/x.pdf`;
    expect((await M.ava.sb.storage.from("transcriptions").upload(theirs, PDF, { contentType: "application/pdf" })).error).toBeTruthy();
    const id = crypto.randomUUID();
    const planted = await M.ava.sb.from("transcriptions").insert({
      id, owner: USERS.ben.id, title: "x", file_path: `${USERS.ben.id}/${id}/x.pdf`, file_kind: "pdf", file_name: "x.pdf", file_mime: "application/pdf", file_size: 1,
    });
    expect(planted.error).toBeTruthy();
    // someone else's row can't be used to upload into their folder either
    const t = await make("ben", { visibility: "public" });
    expect((await M.ava.sb.storage.from("transcriptions").upload(t.path + ".again", PDF, { contentType: "application/pdf" })).error).toBeTruthy();
  });

  it("allows 20 uploads a day, even after deleting, and nobody can read or reset the log", async () => {
    await clear("cleo");
    must(await admin().from("transcription_upload_log").insert(Array.from({ length: 20 }, () => ({ owner: USERS.cleo.id }))), "seed log");
    expect((await make("cleo")).error?.message).toMatch(/20 transcriptions/);
    expect((await M.cleo.sb.from("transcription_upload_log").select("owner")).data ?? []).toHaveLength(0);
    await M.cleo.sb.from("transcription_upload_log").delete().eq("owner", USERS.cleo.id);
    expect((await admin().from("transcription_upload_log").select("owner").eq("owner", USERS.cleo.id)).data).toHaveLength(20);
    // someone else's count is their own
    expect((await make("ben")).error).toBeNull();
    await clear("cleo");
  });
});
