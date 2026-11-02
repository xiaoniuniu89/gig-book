// Profiles: contact details and bio never come out of a plain select; the RPCs reveal only what was shared.
import { beforeAll, describe, expect, it } from "vitest";
import { IDS, USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, scratchBand, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const about = async (m: Musician, who: Who, band?: string) => {
  const r = await m.sb.rpc("band_member_profile", { p_user: USERS[who].id, ...(band ? { p_band: band } : {}) });
  if (r.error) throw new Error(r.error.message);
  return (r.data as { display_name: string; bio: string | null; instruments: string[]; contact: Record<string, string> }[])[0] ?? null;
};

describe("plain selects", () => {
  it("expose the name but never contact, bio, share, instruments or the page slug", async () => {
    for (const w of ["ava", "ben", "eli"] as Who[]) {
      const ok = await M[w].sb.from("profiles").select("id, display_name").eq("id", USERS.dev.id);
      expect(ok.data).toEqual([{ id: USERS.dev.id, display_name: "Dev" }]);
      for (const col of ["contact", "bio", "share", "instruments", "epk_slug", "*"]) {
        const r = await M[w].sb.from("profiles").select(col).eq("id", USERS.ava.id);
        expect(r.error, `${w} selecting ${col}`).toBeTruthy();
      }
    }
  });

  it("can't be read at all when signed out", async () => {
    const r = await anon().from("profiles").select("id, display_name");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
  });

  it("can only be changed by their owner", async () => {
    const r = await M.ben.sb.from("profiles").update({ bio: "hijacked" }).eq("id", USERS.ava.id).select("id");
    expect(r.data ?? []).toHaveLength(0);
    const mine = await M.ben.sb.from("profiles").update({ display_name: "Ben" }).eq("id", USERS.ben.id).select("id");
    expect(mine.data).toHaveLength(1);
    const { data } = await admin().from("profiles").select("bio").eq("id", USERS.ava.id).single();
    expect(data?.bio).toBe(USERS.ava.bio);
  });

  it("my_profile returns your own full profile only", async () => {
    const r = await M.ava.store.getMyProfile();
    expect(r.contact.phone).toBe(USERS.ava.contact.phone);
    expect(r.share.phone).toBe("private");
    expect(r.epkSlug).toBe("ava-music");
    expect((await anon().rpc("my_profile")).error).toBeTruthy();
  });
});

describe("public_profile (signed out)", () => {
  it("returns only the fields shared publicly", async () => {
    const { data, error } = await anon().rpc("public_profile", { p_slug: "ava-music" });
    expect(error).toBeNull();
    expect(data).toEqual([{
      display_name: "Ava", bio: USERS.ava.bio, instruments: ["Piano", "Vocals"], contact: { website: "https://ava.example.test" },
    }]);
  });

  it("hides a contact field again when it goes back to private", async () => {
    const original = USERS.ava.share;
    try {
      must(await M.ava.sb.from("profiles").update({ share: { ...original, phone: "public", website: "private" } }).eq("id", USERS.ava.id), "share");
      const r = (await anon().rpc("public_profile", { p_slug: "ava-music" })).data as { contact: Record<string, string> }[];
      expect(r[0].contact).toEqual({ phone: USERS.ava.contact.phone });
    } finally {
      must(await M.ava.sb.from("profiles").update({ share: original }).eq("id", USERS.ava.id), "restore");
    }
    const r = (await anon().rpc("public_profile", { p_slug: "ava-music" })).data as { contact: Record<string, string> }[];
    expect(Object.keys(r[0].contact)).toEqual(["website"]);
  });

  it("returns nothing for people without a page, and doesn't leak private people", async () => {
    for (const slug of ["nobody-here", "eli", ""]) expect((await anon().rpc("public_profile", { p_slug: slug })).data ?? []).toHaveLength(0);
    const dev = (await anon().rpc("public_profile", { p_slug: "dev-sax" })).data as { contact: object; bio: string | null }[];
    expect(dev[0].bio).toBeNull();
    expect(dev[0].contact).toEqual({ email: "dev@example.test" });
  });

  it("lists no files unless one is shared publicly", async () => {
    expect((await anon().rpc("public_profile_files", { p_slug: "ava-music" })).data ?? []).toHaveLength(0);
  });

  it("band_member_profile isn't available signed out", async () => {
    expect((await anon().rpc("band_member_profile", { p_user: USERS.ava.id })).error).toBeTruthy();
  });
});

describe("band_member_profile", () => {
  it("shows a bandmate what they share with bands or the public, and nothing private", async () => {
    const ava = await about(M.ben, "ava", IDS.avaTrio);
    expect(ava?.display_name).toBe("Ava");
    expect(ava?.bio).toBe(USERS.ava.bio);
    expect(ava?.instruments).toEqual(["Piano", "Vocals"]);
    expect(ava?.contact).toEqual({ email: "ava@example.test", website: "https://ava.example.test" }); // phone is private
    const cleo = await about(M.ben, "cleo", IDS.avaTrio);
    expect(cleo?.contact).toEqual({}); // Cleo keeps her phone private
    expect(cleo?.instruments).toEqual([]); // and shares no instruments
    const ben = await about(M.cleo, "ben", IDS.avaTrio);
    expect(ben?.contact).toEqual({ phone: "+353 1 555 0102" });
    expect(ben?.bio).toBeNull();
  });

  it("returns nothing for people you share no band with", async () => {
    for (const [asker, target] of [["eli", "ava"], ["eli", "ben"], ["cleo", "dev"], ["cleo", "fay"], ["dev", "cleo"], ["fay", "cleo"], ["dev", "eli"]] as [Who, Who][]) {
      expect(await about(M[asker], target), `${asker} asking about ${target}`).toBeNull();
    }
    // a band you're not in doesn't count even if you name it
    expect(await about(M.cleo, "ava", IDS.devQuartet)).toBeNull();
    expect(await about(M.eli, "dev", IDS.devQuartet)).toBeNull();
  });

  it("answers per band: you only see what's shared with a band you're both in", async () => {
    expect(await about(M.fay, "dev", IDS.devQuartet)).toMatchObject({ display_name: "Dev", contact: { email: "dev@example.test" } });
    expect(await about(M.fay, "ben", IDS.devQuartet)).toMatchObject({ contact: { phone: "+353 1 555 0102" } });
    expect(await about(M.fay, "ben", IDS.avaTrio)).toBeNull(); // Fay isn't in Ava Trio
  });

  it("per-band choices override the account-wide ones", async () => {
    const band = await scratchBand(["ava"], ["ben"]);
    must(await M.ava.sb.rpc("band_set_share", { p_band: band, p_share: { phone: true, email: false, bio: false } }), "share");
    const seen = await about(M.ben, "ava", band);
    expect(seen?.contact).toEqual({ phone: USERS.ava.contact.phone, website: "https://ava.example.test" });
    expect(seen?.bio).toBeNull();
    // a different band is unaffected
    expect((await about(M.ben, "ava", IDS.avaTrio))?.contact).toEqual({ email: "ava@example.test", website: "https://ava.example.test" });
    // share choices can't be set for a band you're not in, or for someone else
    must(await M.eli.sb.rpc("band_set_share", { p_band: band, p_share: { bio: true } }), "no-op");
    const row = await admin().from("band_members").select("share").eq("band_id", band).eq("user_id", USERS.ava.id).single();
    expect(row.data?.share).toEqual({ phone: true, email: false, bio: false });
  });

  it("band_member_list gives members the shared bits and outsiders nothing", async () => {
    const list = await M.cleo.store.listBandMembers(IDS.avaTrio);
    expect(list.map(m => m.name).sort()).toEqual(["Ava", "Ben", "Cleo"]);
    const ava = list.find(m => m.name === "Ava");
    expect(ava?.contact).not.toHaveProperty("phone");
    expect(ava?.contact.website).toBeTruthy();
    for (const w of ["eli", "dev", "fay"] as Who[]) expect(await M[w].store.listBandMembers(IDS.avaTrio)).toEqual([]);
  });
});
