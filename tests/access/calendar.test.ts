// Calendar feed (R17): the token is the key, it is owner-only, and a reset token stops working.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, cleanScratch, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });

const gigs: string[] = [];
afterAll(async () => {
  if (gigs.length) await admin().from("gigs").delete().in("id", gigs);
  await admin().from("calendar_feeds").delete().in("owner", [USERS.ava.id, USERS.ben.id]);
  await cleanScratch();
});

const feedFor = async (token: string) => (await admin().rpc("calendar_feed_gigs", { p_token: token })).data as { id: string }[] | null;

describe("calendar feed", () => {
  it("makes one token per person, and a reset replaces it", async () => {
    const a = must(await M.ava.sb.rpc("calendar_feed_token"), "token") as string;
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(must(await M.ava.sb.rpc("calendar_feed_token"), "again")).toBe(a);
    const b = must(await M.ava.sb.rpc("calendar_feed_token", { p_reset: true }), "reset") as string;
    expect(b).not.toBe(a);
    expect(await feedFor(a)).toEqual([]); // the old link gives nothing
    expect((await admin().from("calendar_feeds").select("owner").eq("token", a)).data).toEqual([]);
    expect((await admin().from("calendar_feeds").select("owner").eq("token", b)).data).toHaveLength(1);
  });

  it("signed-out callers can't make a token or read feeds", async () => {
    expect((await anon().rpc("calendar_feed_token")).error).toBeTruthy();
    expect((await anon().rpc("calendar_feed_gigs", { p_token: "x".repeat(40) })).error).toBeTruthy();
    expect((await M.ava.sb.rpc("calendar_feed_gigs", { p_token: "x".repeat(40) })).error).toBeTruthy();
  });

  it("someone else can't read your token", async () => {
    const t = must(await M.ava.sb.rpc("calendar_feed_token"), "token") as string;
    expect((await M.ben.sb.from("calendar_feeds").select("token").eq("token", t)).data).toEqual([]);
    expect((await anon().from("calendar_feeds").select("token")).data ?? []).toEqual([]);
    expect((await M.ben.sb.from("calendar_feeds").update({ token: "y".repeat(40) }).eq("owner", USERS.ava.id)).error).toBeTruthy();
  });

  it("a token returns only its owner's gigs", async () => {
    const id = crypto.randomUUID();
    gigs.push(id);
    must(await admin().from("gigs").insert({ id, created_by: USERS.ava.id, title: "Feed gig", gig_date: "2099-01-01" }), "gig");
    const mine = must(await M.ava.sb.rpc("calendar_feed_token"), "ava") as string;
    const his = must(await M.ben.sb.rpc("calendar_feed_token"), "ben") as string;
    expect((await feedFor(mine))?.map(g => g.id)).toContain(id);
    expect((await feedFor(his))?.map(g => g.id)).not.toContain(id);
    expect(await feedFor("nope")).toEqual([]);
  });
});
