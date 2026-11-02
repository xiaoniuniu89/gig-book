// Licks and resources are private to their owner; a lick linked into a setlist is readable by that setlist's members.
import { beforeAll, describe, expect, it } from "vitest";
import { FILES, IDS, SET_TUNES, USERS, type Who } from "../fixtures";
import { songKey } from "@/lib/songs";
import { admin, everyone, scratchSetlist, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const canRead = async (m: Musician, path: string) => !(await m.sb.storage.from("attachments").download(path)).error;

describe("licks", () => {
  it("are the owner's alone unless linked into a setlist you can read", async () => {
    // Ben's lick isn't linked anywhere
    expect(await M.ben.store.getLick(IDS.benLick)).toBeTruthy();
    for (const w of ["ava", "cleo", "dev", "eli", "fay"] as Who[]) expect(await M[w].store.getLick(IDS.benLick)).toBeNull();
    // Ava's is linked into Ava Trio Book: the trio sees it, outsiders don't
    for (const w of ["ava", "ben", "cleo"] as Who[]) expect((await M[w].store.getLick(IDS.avaLick))?.title).toContain("ii–V–I");
    for (const w of ["dev", "eli", "fay"] as Who[]) expect(await M[w].store.getLick(IDS.avaLick)).toBeNull();
  });

  it("listLicks shows only your own", async () => {
    for (const w of ["ben", "cleo"] as Who[]) {
      const ls = await M[w].store.listLicks();
      expect(ls.every(l => l.mine)).toBe(true);
    }
    expect((await M.ben.store.listLicks()).map(l => l.id)).toEqual([IDS.benLick]);
  });

  it("can't be edited or deleted by someone who can only read them", async () => {
    await expect(M.ben.store.updateLick(IDS.avaLick, { title: "x", body: "", tags: [], progression: "", key: "", notation: "" })).rejects.toThrow();
    await M.cleo.store.deleteLick(IDS.avaLick);
    const { data } = await admin().from("licks").select("title").eq("id", IDS.avaLick).single();
    expect(data?.title).toBe("Ava's ii–V–I");
  });

  it("can only be linked by their owner, into a setlist the owner is in", async () => {
    const id = await scratchSetlist({ owner: "ava", members: { cleo: "viewer" } });
    const link = (m: Musician, lick: string) => m.sb.from("lick_links").insert({ lick_id: lick, setlist_id: id });
    expect((await link(M.cleo, IDS.cleoLick)).error).toBeNull();
    expect((await link(M.cleo, IDS.benLick)).error).toBeTruthy(); // someone else's lick
    expect((await link(M.eli, IDS.eliLick)).error).toBeTruthy(); // not in the setlist
    // Cleo's lick is now readable by the setlist's members, and only them
    expect(await M.ava.store.getLick(IDS.cleoLick)).toBeTruthy();
    expect(await M.ben.store.getLick(IDS.cleoLick)).toBeNull();
  });

  it("song links (no setlist) are private to the person who made them", async () => {
    const key = songKey(SET_TUNES[IDS.avaSet][0]);
    const l = await M.ben.store.linkLick(IDS.benLick, { kind: "song", songKey: key });
    expect((await M.ben.store.listLickLinks({ kind: "song", songKey: key })).map(x => x.id)).toContain(l.id);
    expect(await M.ava.store.listLickLinks({ kind: "song", songKey: key })).toEqual([]);
    await M.ben.store.unlinkLick(l.id);
  });

  it("files follow the lick", async () => {
    for (const w of ["ava", "ben", "cleo"] as Who[]) expect(await canRead(M[w], FILES.avaLick)).toBe(true);
    for (const w of ["dev", "eli", "fay"] as Who[]) expect(await canRead(M[w], FILES.avaLick)).toBe(false);
  });
});

describe("resources", () => {
  it("are visible to their owner only, even inside shared setlists", async () => {
    expect((await M.ava.store.listResources()).map(r => r.id).sort()).toEqual([IDS.avaRes, IDS.avaPdfRes].sort());
    for (const w of ["ben", "cleo", "dev", "eli", "fay"] as Who[]) {
      expect(await M[w].store.listResources()).not.toContainEqual(expect.objectContaining({ id: IDS.avaRes }));
      const r = await M[w].sb.from("resources").select("id").in("id", [IDS.avaRes, IDS.avaPdfRes]);
      expect(r.data ?? []).toHaveLength(0);
    }
  });

  it("can't be changed, deleted or linked by anyone else", async () => {
    await expect(M.ben.store.updateResource(IDS.avaRes, { kind: "link", title: "x", url: "https://x.test", tags: [], note: "" })).rejects.toThrow();
    await M.ben.store.deleteResource(IDS.avaRes);
    expect((await admin().from("resources").select("id").eq("id", IDS.avaRes)).data).toHaveLength(1);
    const link = await M.ben.sb.from("resource_links").insert({ resource_id: IDS.avaRes, song_key: "x|y" });
    expect(link.error).toBeTruthy();
  });

  it("links to a tune are the linker's own", async () => {
    const key = songKey(SET_TUNES[IDS.avaSet][0]);
    expect((await M.ava.store.listResourceLinks(key)).map(l => l.resource.id)).toEqual([IDS.avaRes]);
    expect(await M.ben.store.listResourceLinks(key)).toEqual([]);
  });

  it("files are readable by the owner only", async () => {
    expect(await canRead(M.ava, FILES.avaRes)).toBe(true);
    for (const w of ["ben", "cleo", "dev", "eli", "fay"] as Who[]) {
      expect(await canRead(M[w], FILES.avaRes)).toBe(false);
      expect(await M[w].store.listResourceFiles([IDS.avaPdfRes])).toEqual([]);
    }
    expect(USERS.ava.id).toBeTruthy();
  });
});
