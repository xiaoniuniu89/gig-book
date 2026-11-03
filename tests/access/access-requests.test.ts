// Request access (migration 0023): anyone can ask through request_access(), nobody can touch the table directly.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, as, type Musician } from "./helpers";

const mail = (k: string) => `req-${k}-${Date.now()}@example.com`;
const made: string[] = [];
let ava: Musician;
beforeAll(async () => { ava = await as("ava"); });
afterAll(async () => { if (made.length) await admin().from("access_requests").delete().in("email", made); });

describe("access requests", () => {
  it("signed out can ask, and the email is stored lowercased", async () => {
    const e = mail("a"); made.push(e);
    const r = await anon().rpc("request_access", { p_email: e.toUpperCase(), p_name: "Pat", p_instrument: "Bass", p_note: "Hi" });
    expect(r.error).toBeNull();
    const { data } = await admin().from("access_requests").select("email,name").eq("email", e);
    expect(data).toEqual([{ email: e, name: "Pat" }]);
  });

  it("a duplicate email doesn't error and doesn't add a row", async () => {
    const e = mail("b"); made.push(e);
    expect((await anon().rpc("request_access", { p_email: e, p_name: "Pat" })).error).toBeNull();
    expect((await anon().rpc("request_access", { p_email: e, p_name: "Other" })).error).toBeNull();
    const { data } = await admin().from("access_requests").select("name").eq("email", e);
    expect(data).toEqual([{ name: "Pat" }]);
  });

  it("signed-in users can call it too", async () => {
    const e = mail("c"); made.push(e);
    expect((await ava.sb.rpc("request_access", { p_email: e, p_name: "Pat" })).error).toBeNull();
  });

  it("bad input is rejected", async () => {
    const bad = [
      { p_email: "nope", p_name: "Pat" },
      { p_email: mail("d"), p_name: "" },
      { p_email: mail("d"), p_name: "x".repeat(81) },
      { p_email: mail("d"), p_name: "Pat", p_instrument: "x".repeat(61) },
      { p_email: mail("d"), p_name: "Pat", p_note: "x".repeat(501) },
    ];
    for (const args of bad) expect((await anon().rpc("request_access", args)).error).toBeTruthy();
  });

  it("nobody can read or write the table directly", async () => {
    const row = { email: mail("e"), name: "Pat" };
    for (const sb of [anon(), ava.sb]) {
      expect((await sb.from("access_requests").select("*")).error).toBeTruthy();
      expect((await sb.from("access_requests").insert(row)).error).toBeTruthy();
      expect((await sb.from("access_requests").update({ name: "X" }).eq("name", "Pat")).error).toBeTruthy();
      expect((await sb.from("access_requests").delete().eq("name", "Pat")).error).toBeTruthy();
    }
    const { data } = await admin().from("access_requests").select("id").eq("email", row.email);
    expect(data).toHaveLength(0);
  });
});
