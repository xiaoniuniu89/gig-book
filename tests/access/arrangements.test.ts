// Arrangements: your own rows only, in every direction.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const RAW = "Autumn Leaves=Kosma Joseph=Medium Swing=G=n=T44[*AC-7 |F7 |Bbmaj7 |Ebmaj7 |A-7b5 |D7 |G-7 |G-7 Z";
const made: string[] = [];
const newId = () => { const id = crypto.randomUUID(); made.push(id); return id; };

beforeAll(async () => { M = await everyone(); });
afterAll(async () => { if (made.length) await admin().from("arrangements").delete().in("id", made); });

describe("arrangements", () => {
  it("save, read back, update and delete as the owner", async () => {
    const id = newId();
    await M.ava.store.saveArrangement({ id, name: "Ballad in Eb", raw: RAW, shift: 3, versions: [{ uri: "youtube:abc", name: "Take", artists: "Someone" }], createdAt: "" });
    let mine = (await M.ava.store.listArrangements()).find(a => a.id === id);
    expect(mine).toMatchObject({ name: "Ballad in Eb", raw: RAW, shift: 3 });
    expect(mine?.versions).toHaveLength(1);
    await M.ava.store.saveArrangement({ ...mine!, name: "Ballad in D", shift: null });
    mine = (await M.ava.store.listArrangements()).find(a => a.id === id);
    expect(mine).toMatchObject({ name: "Ballad in D", shift: null });
    await M.ava.store.deleteArrangement(id);
    expect((await M.ava.store.listArrangements()).some(a => a.id === id)).toBe(false);
  });

  it("can't be read, changed, deleted or created for someone else", async () => {
    const id = newId();
    await M.ava.store.saveArrangement({ id, name: "Mine", raw: RAW, shift: 0, versions: [], createdAt: "" });
    expect((await M.ben.store.listArrangements()).some(a => a.id === id)).toBe(false);
    const upd = await M.ben.sb.from("arrangements").update({ name: "Stolen" }).eq("id", id).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await M.ben.sb.from("arrangements").delete().eq("id", id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const ins = await M.ben.sb.from("arrangements").insert({ owner: USERS.ava.id, name: "Planted", song: RAW });
    expect(ins.error).toBeTruthy();
    // an upsert over someone else's id can't take it over
    await M.ben.store.saveArrangement({ id, name: "Taken", raw: RAW, shift: 1, versions: [], createdAt: "" }).catch(() => {});
    const { data } = await admin().from("arrangements").select("owner, name").eq("id", id).single();
    expect(data).toMatchObject({ owner: USERS.ava.id, name: "Mine" });
  });

  it("refuses empty names and out-of-range keys", async () => {
    const bad = await M.ava.sb.from("arrangements").insert({ name: "", song: RAW });
    expect(bad.error).toBeTruthy();
    const far = await M.ava.sb.from("arrangements").insert({ name: "x", song: RAW, shift: 12 });
    expect(far.error).toBeTruthy();
  });

  it("is closed to signed-out visitors", async () => {
    const r = await anon().from("arrangements").select("id");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
  });
});
