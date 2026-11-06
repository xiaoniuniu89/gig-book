// Original songs (0041): private to the owner, shared with one band, or public to anyone signed in; only the owner changes or
// deletes; lead sheets follow the row's rules and can only go to a path one of your rows names; 20 new songs or sheets a day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { encodeChart } from "@/lib/irealExport";
import { admin, anon, cleanScratch, everyone, must, scratchBand, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const PDF = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });
const WHO: Who[] = ["ava", "ben", "cleo", "dev"];
const rawOf = (title: string) => encodeChart({ title, composer: "Callaghan Dan", style: "Medium Swing", key: "C", sections: [{ name: "A", ts: "4/4", bars: [{ chords: ["C^7"] }, { chords: ["D-7", "G7"] }] }] });

/** A song made by `who` through their own client; `sheet` also gives it a lead sheet file. */
async function make(who: Who, o: { visibility?: "private" | "band" | "public"; band?: string; sheet?: boolean; title?: string } = {}) {
  const id = crypto.randomUUID(), path = `${USERS[who].id}/${id}/sheet.pdf`;
  const ins = await M[who].sb.from("original_songs").insert({
    id, raw: rawOf(o.title ?? "Scratch Tune"), visibility: o.visibility ?? "private", band_id: o.band ?? null,
    ...(o.sheet ? { lead_sheet_path: path, lead_sheet_kind: "pdf", lead_sheet_name: "sheet.pdf", lead_sheet_mime: "application/pdf", lead_sheet_size: PDF.size } : {}),
  });
  if (ins.error) return { id, path, error: ins.error };
  if (o.sheet) must(await M[who].sb.storage.from("leadsheets").upload(path, PDF, { contentType: "application/pdf" }), `${who} upload`);
  return { id, path, error: null };
}
async function clear(who: Who) {
  const a = admin();
  const { data } = await a.from("original_songs").select("lead_sheet_path").eq("owner", USERS[who].id);
  const paths = (data ?? []).map(r => r.lead_sheet_path as string | null).filter((p): p is string => !!p);
  if (paths.length) await a.storage.from("leadsheets").remove(paths);
  await a.from("original_songs").delete().eq("owner", USERS[who].id);
  await a.from("original_upload_log").delete().eq("owner", USERS[who].id);
}
const visible = async (who: Who, id: string) => (await M[who].sb.from("original_songs").select("id").eq("id", id)).data?.length === 1;
const canDownload = async (who: Who, path: string) => !(await M[who].sb.storage.from("leadsheets").download(path)).error;

beforeAll(async () => { M = await everyone(); for (const w of WHO) await clear(w); });
afterAll(async () => { for (const w of WHO) await clear(w); await cleanScratch(); });

describe("originals: who can see one", () => {
  it("private: the owner only, row and lead sheet", async () => {
    const s = await make("ava", { sheet: true });
    expect(s.error).toBeNull();
    expect(await visible("ava", s.id)).toBe(true);
    expect(await canDownload("ava", s.path)).toBe(true);
    expect(await visible("ben", s.id)).toBe(false);
    expect(await canDownload("ben", s.path)).toBe(false);
    expect((await anon().from("original_songs").select("id")).data ?? []).toHaveLength(0);
    expect((await M.ava.store.listOriginals()).map(o => o.id)).toContain(s.id);
    expect((await M.ben.store.listOriginals()).map(o => o.id)).not.toContain(s.id);
  });

  it("public: anyone signed in, found by search, not signed out", async () => {
    const s = await make("ava", { visibility: "public", sheet: true, title: "Zebra Original" });
    expect(await visible("ben", s.id)).toBe(true);
    expect(await canDownload("ben", s.path)).toBe(true);
    expect((await M.ben.store.searchOriginals("zebra orig")).map(o => o.id)).toContain(s.id);
    expect((await M.ava.store.searchOriginals("zebra orig")).map(o => o.id)).not.toContain(s.id); // yours are in your library
    expect(await M.ben.store.searchOriginals("z")).toEqual([]);
    expect((await anon().from("original_songs").select("id").eq("id", s.id)).data ?? []).toHaveLength(0);
    expect((await anon().storage.from("leadsheets").download(s.path)).error).toBeTruthy();
    must(await M.ava.sb.from("original_songs").update({ visibility: "private" }).eq("id", s.id), "make private");
    expect(await visible("ben", s.id)).toBe(false);
    expect(await canDownload("ben", s.path)).toBe(false);
  });

  it("band: the band's members, not other people", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const s = await make("ava", { visibility: "band", band, sheet: true });
    expect(s.error).toBeNull();
    expect(await visible("ben", s.id)).toBe(true);
    expect(await canDownload("ben", s.path)).toBe(true);
    expect(await visible("cleo", s.id)).toBe(false);
    expect(await canDownload("cleo", s.path)).toBe(false);
    expect((await M.ben.store.searchOriginals("scratch tune")).map(o => o.id)).toContain(s.id);
    expect((await M.cleo.store.searchOriginals("scratch tune")).map(o => o.id)).not.toContain(s.id);
  });

  it("band: only a band you are in, and the pairing of visibility and band is enforced", async () => {
    const band = await scratchBand(["ben"]);
    expect((await make("ava", { visibility: "band", band })).error).toBeTruthy(); // Ava isn't in it
    const mine = await scratchBand(["ava"]);
    expect((await make("ava", { visibility: "private", band: mine })).error).toBeTruthy(); // a band on a private song
    // "band" with no band quietly becomes private
    const s = await make("ava", { visibility: "band" });
    expect(s.error).toBeNull();
    const row = must(await M.ava.sb.from("original_songs").select("visibility, band_id").eq("id", s.id).single(), "row");
    expect(row).toEqual({ visibility: "private", band_id: null });
  });

  it("deleting the band turns its songs private", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    const s = await make("ava", { visibility: "band", band });
    expect(await visible("ben", s.id)).toBe(true);
    await admin().from("bands").delete().eq("id", band);
    expect(await visible("ben", s.id)).toBe(false);
    const row = must(await M.ava.sb.from("original_songs").select("visibility, band_id").eq("id", s.id).single(), "row");
    expect(row).toEqual({ visibility: "private", band_id: null });
  });
});

describe("originals: changing and deleting", () => {
  it("the title and composer come from the song string", async () => {
    const s = await make("ava", { title: "Derived Title" });
    const row = must(await M.ava.sb.from("original_songs").select("title, composer").eq("id", s.id).single(), "row");
    expect(row).toEqual({ title: "Derived Title", composer: "Callaghan Dan" });
    must(await M.ava.sb.from("original_songs").update({ raw: rawOf("Renamed") }).eq("id", s.id), "rename");
    expect(must(await M.ava.sb.from("original_songs").select("title").eq("id", s.id).single(), "row").title).toBe("Renamed");
  });

  it("only the owner updates or deletes, even a public one", async () => {
    const s = await make("ava", { visibility: "public", sheet: true });
    const up = await M.ben.sb.from("original_songs").update({ raw: rawOf("Mine now") }).eq("id", s.id).select("id");
    expect(up.data ?? []).toHaveLength(0);
    const del = await M.ben.sb.from("original_songs").delete().eq("id", s.id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    expect((await M.ben.sb.storage.from("leadsheets").remove([s.path])).data ?? []).toHaveLength(0);
    expect(await canDownload("ava", s.path)).toBe(true);
    // the owner can't hand it over or point it at another folder
    await M.ava.sb.from("original_songs").update({ owner: USERS.ben.id }).eq("id", s.id);
    expect(must(await admin().from("original_songs").select("owner").eq("id", s.id).single(), "row").owner).toBe(USERS.ava.id);
    const moved = await M.ava.sb.from("original_songs").update({ lead_sheet_path: `${USERS.ben.id}/${s.id}/x.pdf` }).eq("id", s.id).select("id");
    expect(moved.data ?? []).toHaveLength(0);
    // the owner deletes: row and file go
    const own = (await M.ava.store.listOriginals()).find(o => o.id === s.id)!;
    await M.ava.store.deleteOriginal(own);
    expect(await visible("ava", s.id)).toBe(false);
    expect(await canDownload("ava", s.path)).toBe(false);
  });
});

describe("originals: lead sheet uploads", () => {
  it("only to a path one of your rows names, in your own folder", async () => {
    const mine = await make("ava", { sheet: false });
    const path = `${USERS.ava.id}/${mine.id}/nope.pdf`;
    // no row names this path yet
    expect((await M.ava.sb.storage.from("leadsheets").upload(path, PDF, { contentType: "application/pdf" })).error).toBeTruthy();
    // someone else can't use a path in Ava's folder, even once her row names it
    must(await M.ava.sb.from("original_songs").update({ lead_sheet_path: path, lead_sheet_kind: "pdf", lead_sheet_name: "nope.pdf", lead_sheet_mime: "application/pdf", lead_sheet_size: PDF.size }).eq("id", mine.id), "name the path");
    expect((await M.ben.sb.storage.from("leadsheets").upload(path, PDF, { contentType: "application/pdf" })).error).toBeTruthy();
    expect((await M.ava.sb.storage.from("leadsheets").upload(path, PDF, { contentType: "application/pdf" })).error).toBeNull();
    // a row can't name a path in someone else's folder or for another row
    expect((await M.ben.sb.from("original_songs").insert({ raw: rawOf("Sneaky"), lead_sheet_path: `${USERS.ava.id}/${mine.id}/x.pdf`, lead_sheet_kind: "pdf", lead_sheet_name: "x.pdf", lead_sheet_mime: "application/pdf", lead_sheet_size: 1 })).error).toBeTruthy();
  });

  it("a lead sheet's columns are all there or all empty", async () => {
    const id = crypto.randomUUID();
    const r = await M.ava.sb.from("original_songs").insert({ id, raw: rawOf("Half"), lead_sheet_path: `${USERS.ava.id}/${id}/h.pdf` });
    expect(r.error).toBeTruthy();
  });
});

describe("originals: the daily cap", () => {
  it("20 new songs or lead sheets in 24 hours, then a clear message", async () => {
    await clear("dev");
    for (let i = 0; i < 20; i++) must(await M.dev.sb.from("original_songs").insert({ raw: rawOf("Cap " + i) }), "song " + i);
    const over = await M.dev.sb.from("original_songs").insert({ raw: rawOf("One too many") });
    expect(over.error?.message).toMatch(/new songs or lead sheets today/);
    // editing the chart isn't an upload
    const one = must(await M.dev.sb.from("original_songs").select("id").eq("owner", USERS.dev.id).limit(1), "one")[0];
    expect((await M.dev.sb.from("original_songs").update({ raw: rawOf("Edited") }).eq("id", one.id)).error).toBeNull();
    // but a new lead sheet is
    const path = `${USERS.dev.id}/${one.id}/new.pdf`;
    const sheet = await M.dev.sb.from("original_songs").update({ lead_sheet_path: path, lead_sheet_kind: "pdf", lead_sheet_name: "new.pdf", lead_sheet_mime: "application/pdf", lead_sheet_size: 1 }).eq("id", one.id);
    expect(sheet.error?.message).toMatch(/new songs or lead sheets today/);
    // the log can't be read or changed by anyone signed in
    expect((await M.dev.sb.from("original_upload_log").select("owner")).error).toBeTruthy();
    await clear("dev");
  });
});
