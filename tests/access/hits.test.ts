// Hits and feels live on the setlist item: readers see them, only those who can change the setlist edit them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS } from "../fixtures";
import { admin, cleanScratch, everyone, must, scratchSetlist, type Musician } from "./helpers";

let M: Record<string, Musician>;
beforeAll(async () => { M = await everyone(); });
afterAll(cleanScratch);

const hits = [{ bar: 7, eighth: 3, kind: "hit" }, { bar: 8, eighth: 0, kind: "stop", until: 11 }];
const item = (h: unknown) => [{ position: 0, song: "Hit Tune=X==Medium Swing=C==", set_no: 1, hits: h, feels: { A: "latin" } }];

const cases = [
  { name: "owner", who: "ava", setup: () => scratchSetlist({ owner: "ava" }), edit: true },
  { name: "direct editor", who: "cleo", setup: () => scratchSetlist({ owner: "ava", members: { cleo: "editor" } }), edit: true },
  { name: "direct viewer", who: "ben", setup: () => scratchSetlist({ owner: "ava", members: { ben: "viewer" } }), edit: false },
  { name: "band member who can change setlists", who: "ben", setup: () => scratchSetlist({ owner: "ava", band: IDS.avaTrio }), edit: true },
  { name: "band member who can't", who: "cleo", setup: () => scratchSetlist({ owner: "ava", band: IDS.avaTrio }), edit: false },
] as const;

describe.each(cases)("hits as $name", c => {
  let id: string;
  beforeAll(async () => { id = await c.setup(); });

  it("saves through the setlist function only if allowed", async () => {
    const r = await M[c.who].sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: item(hits) });
    expect(!r.error).toBe(c.edit);
    const { data } = await admin().from("setlist_items").select("hits, feels").eq("setlist_id", id);
    expect(data?.some(x => (x.hits as unknown[]).length === 2 && x.feels.A === "latin")).toBe(c.edit);
  });

  it("can't change them with a direct update unless allowed", async () => {
    must(await admin().from("setlist_items").update({ hits: [] }).eq("setlist_id", id), "reset");
    const r = await M[c.who].sb.from("setlist_items").update({ hits }).eq("setlist_id", id).select("id");
    expect((r.data?.length ?? 0) > 0).toBe(c.edit);
  });

  it("everyone who can read the setlist sees the hits", async () => {
    must(await admin().from("setlist_items").update({ hits }).eq("setlist_id", id), "seed hits");
    const s = await M[c.who].store.getSetlist(id);
    expect(s?.items[0].hits).toEqual(hits);
  });
});

describe("hits shape", () => {
  it("rejects more than 300 marks and non-lists", async () => {
    const id = await scratchSetlist({ owner: "ava" });
    const many = Array.from({ length: 301 }, (_, i) => ({ bar: i % 32, eighth: i % 8, kind: "hit" }));
    expect((await M.ava.sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: item(many) })).error).toBeTruthy();
    expect((await M.ava.sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: item({ bar: 1 }) })).error).toBeTruthy();
  });
});
