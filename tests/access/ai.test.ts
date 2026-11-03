// Niu AI limits (migration 0021): drafts are claimed only through ai_claim(), within the per-user daily limit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, must, type Musician } from "./helpers";

let M: Record<Who, Musician>;
const clear = () => admin().from("ai_usage").delete().in("user_id", [USERS.ava.id, USERS.ben.id]);
beforeAll(async () => { M = await everyone(); await clear(); });
afterAll(async () => { await clear(); });

describe("ai limits", () => {
  it("a draft can't be recorded or erased directly", async () => {
    const ins = await M.ava.sb.from("ai_usage").insert({ user_id: USERS.ava.id });
    expect(ins.error).toBeTruthy();
    const other = await M.ava.sb.from("ai_usage").insert({ user_id: USERS.ben.id });
    expect(other.error).toBeTruthy();
  });

  it("each user gets the per-user limit, then is refused; others are unaffected", async () => {
    const [{ per_user }] = must(await M.ava.sb.rpc("ai_limits")) as { per_user: number; site: number }[];
    expect(must(await M.ava.sb.rpc("ai_remaining"))).toBe(per_user);
    for (let k = per_user - 1; k >= 0; k--) expect(must(await M.ava.sb.rpc("ai_claim"))).toBe(k);
    const over = await M.ava.sb.rpc("ai_claim");
    expect(over.error?.message).toContain("user_limit");
    expect(must(await M.ava.sb.rpc("ai_remaining"))).toBe(0);
    expect(must(await M.ben.sb.rpc("ai_claim"))).toBe(per_user - 1);
  });

  it("claims at the same time can't beat the limit", async () => {
    await admin().from("ai_usage").delete().eq("user_id", USERS.ben.id);
    const [{ per_user }] = must(await M.ben.sb.rpc("ai_limits")) as { per_user: number }[];
    const runs = await Promise.all(Array.from({ length: per_user + 5 }, () => M.ben.sb.rpc("ai_claim")));
    expect(runs.filter(r => !r.error)).toHaveLength(per_user);
    const { count } = await admin().from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", USERS.ben.id);
    expect(count).toBe(per_user);
  });

  it("signed out can't claim", async () => {
    expect((await anon().rpc("ai_claim")).error).toBeTruthy();
    expect((await anon().from("ai_usage").insert({ user_id: USERS.ava.id })).error).toBeTruthy();
  });
});
