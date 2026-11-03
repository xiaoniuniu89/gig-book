// Who can read, edit, rename, delete and share a setlist. Each case gets its own scratch setlist.
import { beforeAll, describe, expect, it } from "vitest";
import { IDS, USERS, type Who } from "../fixtures";
import { admin, everyone, must, scratchBand, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const item = (n: string) => [{ position: 0, song: `Edited ${n}=X==Medium Swing=C==`, set_no: 1 }];

interface Case { name: string; who: Who; setup: () => Promise<string>; read: boolean; edit: boolean; rename: boolean; del: boolean; manage: boolean }
const none = { read: false, edit: false, rename: false, del: false, manage: false };
const cases: Case[] = [
  { name: "owner", who: "ava", setup: () => scratchSetlist({ owner: "ava" }), read: true, edit: true, rename: true, del: true, manage: true },
  { name: "direct viewer", who: "ben", setup: () => scratchSetlist({ owner: "ava", members: { ben: "viewer" } }), ...none, read: true },
  { name: "direct editor", who: "cleo", setup: () => scratchSetlist({ owner: "ava", members: { cleo: "editor" } }), ...none, read: true, edit: true, rename: true },
  { name: "band member with edit_setlists", who: "ben", setup: () => scratchSetlist({ owner: "ava", band: IDS.avaTrio }), ...none, read: true, edit: true, rename: true },
  { name: "band member without edit_setlists", who: "cleo", setup: () => scratchSetlist({ owner: "ava", band: IDS.avaTrio }), ...none, read: true },
  { name: "non-member", who: "eli", setup: () => scratchSetlist({ owner: "ava", band: IDS.avaTrio, members: { ben: "viewer" } }), ...none },
  {
    name: "removed band member", who: "fay", ...none,
    setup: async () => {
      const band = await scratchBand(["ava"], ["fay"], { notes: true, edit_setlists: true, add_setlists: false, invite: false });
      const id = await scratchSetlist({ owner: "ava", band });
      const before = await M.fay.store.getSetlist(id);
      expect(before?.role).toBe("editor"); // she had access until now
      must(await M.ava.sb.rpc("band_remove_member", { p_band: band, p_user: USERS.fay.id }), "remove fay");
      return id;
    },
  },
];

describe.each(cases)("setlist as $name", c => {
  let id: string;
  beforeAll(async () => { id = await c.setup(); });

  it("read", async () => {
    const s = await M[c.who].store.getSetlist(id);
    expect(!!s).toBe(c.read);
    const raw = await M[c.who].sb.from("setlist_items").select("id").eq("setlist_id", id);
    expect(raw.data?.length ?? 0).toBe(c.read ? 1 : 0);
  });

  it("edit items", async () => {
    const r = await M[c.who].sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: item(c.name) });
    expect(!r.error).toBe(c.edit);
    const { data } = await admin().from("setlist_items").select("song").eq("setlist_id", id);
    expect(data?.some(r => r.song.startsWith("Edited"))).toBe(c.edit);
  });

  it("rename", async () => {
    const r = await M[c.who].sb.from("setlists").update({ name: "Renamed" }).eq("id", id).select("id");
    expect((r.data?.length ?? 0) > 0).toBe(c.rename);
    const { data } = await admin().from("setlists").select("name").eq("id", id).single();
    expect(data?.name === "Renamed").toBe(c.rename);
  });

  it("manage members", async () => {
    // Dev is a bystander on the setlist: the thing others try (and fail) to promote or remove
    must(await admin().from("setlist_members").upsert({ setlist_id: id, user_id: USERS.dev.id, role: "viewer" }), "decoy");
    const add = await M[c.who].sb.rpc("add_setlist_member", { p_setlist: id, p_email: USERS.eli.email, p_role: "editor" });
    expect(!add.error).toBe(c.manage);
    const direct = await M[c.who].sb.from("setlist_members").insert({ setlist_id: id, user_id: USERS.fay.id, role: "viewer" });
    expect(!direct.error).toBe(c.manage);
    const list = await M[c.who].sb.rpc("setlist_member_list", { p_setlist: id });
    expect(!list.error).toBe(c.read);
    // nobody else can promote or remove people either
    const role = await M[c.who].sb.from("setlist_members").update({ role: "editor" }).eq("setlist_id", id).select("user_id");
    const rm = await M[c.who].sb.from("setlist_members").delete().eq("setlist_id", id).eq("user_id", USERS.dev.id).select("user_id");
    if (!c.manage) {
      expect(role.data?.some(r => r.user_id === USERS.dev.id) ?? false).toBe(false);
      expect(rm.data ?? []).toHaveLength(0);
    }
  });

  it("delete (last: the setlist is gone only for the owner)", async () => {
    const r = await M[c.who].sb.from("setlists").delete().eq("id", id).select("id");
    expect((r.data?.length ?? 0) > 0).toBe(c.del);
    const { data } = await admin().from("setlists").select("id").eq("id", id);
    expect(data?.length === 0).toBe(c.del);
  });
});

describe("setlist guards", () => {
  it("editors can't change the owner, visibility or the band", async () => {
    const id = await scratchSetlist({ owner: "ava", band: IDS.avaTrio });
    const move = await M.ben.sb.from("setlists").update({ band_id: null }).eq("id", id);
    expect(move.error?.message).toMatch(/owner can share/i);
    const vis = await M.ben.sb.from("setlists").update({ visibility: "public" }).eq("id", id);
    expect(vis.error).toBeTruthy();
    const own = await M.ben.sb.from("setlists").update({ owner: USERS.ben.id }).eq("id", id);
    expect(own.error).toBeTruthy();
    const { data } = await admin().from("setlists").select("owner, band_id, visibility").eq("id", id).single();
    expect(data).toEqual({ owner: USERS.ava.id, band_id: IDS.avaTrio, visibility: "private" });
  });

  it("only a member with add_setlists can put a setlist into a band", async () => {
    const mine = await scratchSetlist({ owner: "cleo" });
    // Cleo has the default permissions in Ava Trio: no add_setlists
    await expect(M.cleo.store.setSetlistBand(mine, IDS.avaTrio)).rejects.toThrow();
    const again = await M.cleo.sb.from("setlists").select("band_id").eq("id", mine).single();
    expect(again.data?.band_id).toBeNull();
    // Ava is an admin
    const hers = await scratchSetlist({ owner: "ava" });
    await M.ava.store.setSetlistBand(hers, IDS.avaTrio);
    expect((await M.cleo.store.getSetlist(hers))?.role).toBe("viewer");
    // Eli isn't in the band at all
    const eli = await scratchSetlist({ owner: "eli" });
    await expect(M.eli.store.setSetlistBand(eli, IDS.avaTrio)).rejects.toThrow();
  });

  it("listSetlists shows your own plus what's shared with you directly", async () => {
    const eli = await M.eli.store.listSetlists();
    expect(eli.every(s => s.role === "owner")).toBe(true);
    expect(eli.some(s => s.id === IDS.eliSet)).toBe(true);
    expect(eli.some(s => s.id === IDS.avaSet || s.id === IDS.avaTrioSet)).toBe(false);
    const ben = await M.ben.store.listSetlists();
    expect(ben.find(s => s.id === IDS.avaSet)?.role).toBe("viewer");
    expect(ben.some(s => s.id === IDS.cleoSet)).toBe(false);
  });

  it("a setlist can have up to 9 sets (0024)", async () => {
    const id = await scratchSetlist({ owner: "ava" });
    const at = (set_no: number) => [{ position: 0, song: "Sets=X==Medium Swing=C==", set_no }];
    must(await M.ava.sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: at(3) }), "set 3");
    expect((await M.ava.store.getSetlist(id))?.items[0].set).toBe(3);
    expect((await M.ava.sb.rpc("replace_setlist_items", { p_setlist_id: id, p_items: at(10) })).error).toBeTruthy();
  });

  it("the signed-out client sees no setlists", async () => {
    const { anon } = await import("./helpers");
    const r = await anon().from("setlists").select("id");
    expect(r.data ?? []).toHaveLength(0);
  });

  it("seeded roles through the adapter", async () => {
    expect((await M.ava.store.getSetlist(IDS.avaSet))?.role).toBe("owner");
    expect((await M.ben.store.getSetlist(IDS.avaSet))?.role).toBe("viewer");
    expect((await M.cleo.store.getSetlist(IDS.avaSet))?.role).toBe("editor");
    expect(await M.eli.store.getSetlist(IDS.avaSet)).toBeNull();
    expect((await M.ben.store.getSetlist(IDS.avaTrioSet))?.role).toBe("editor");
    expect((await M.cleo.store.getSetlist(IDS.avaTrioSet))?.role).toBe("viewer");
    expect(await M.eli.store.getSetlist(IDS.avaTrioSet)).toBeNull();
    expect((await M.ava.store.getSetlist(IDS.devQuartetSet))?.role).toBe("editor"); // a Dev Quartet admin holds every permission; Dev owns it
    expect((await M.ben.store.getSetlist(IDS.devQuartetSet))?.role).toBe("viewer");
    expect(await M.cleo.store.getSetlist(IDS.devQuartetSet)).toBeNull();
  });
});
