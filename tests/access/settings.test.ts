// Settings: your own row only, and keys we don't know about survive a save.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, type Who } from "../fixtures";
import { admin, anon, everyone, type Musician } from "./helpers";

let M: Record<Who, Musician>;
beforeAll(async () => { M = await everyone(); });
afterAll(async () => { await admin().from("user_settings").delete().in("user_id", [USERS.ava.id, USERS.ben.id]); });

describe("user_settings", () => {
  it("starts empty, then saves and reads back, keeping keys it doesn't know", async () => {
    expect(await M.ava.store.getSettings()).toBeNull();
    await M.ava.store.saveSettings({ theme: "dark", textSize: "large", player: "spotify", future: { x: 1 } });
    await M.ava.store.saveSettings({ theme: "system", textSize: "large", player: "spotify", future: { x: 1 } }); // second save updates
    const s = await M.ava.store.getSettings();
    expect(s).toMatchObject({ theme: "system", textSize: "large", player: "spotify", future: { x: 1 } });
  });

  it("fills in defaults for missing or bad values", async () => {
    await admin().from("user_settings").upsert({ user_id: USERS.ben.id, settings: { theme: "purple", extra: true } });
    expect(await M.ben.store.getSettings()).toMatchObject({ theme: "light", textSize: "normal", player: "youtube", extra: true });
  });

  it("can't be read, changed or created by anyone else", async () => {
    const seen = await M.ben.sb.from("user_settings").select("user_id").eq("user_id", USERS.ava.id);
    expect(seen.data ?? []).toHaveLength(0);
    const upd = await M.ben.sb.from("user_settings").update({ settings: { theme: "dark" } }).eq("user_id", USERS.ava.id).select("user_id");
    expect(upd.data ?? []).toHaveLength(0);
    const ins = await M.ben.sb.from("user_settings").insert({ user_id: USERS.cleo.id, settings: {} });
    expect(ins.error).toBeTruthy();
    const del = await M.ben.sb.from("user_settings").delete().eq("user_id", USERS.ava.id).select("user_id");
    expect(del.data ?? []).toHaveLength(0);
    const { data } = await admin().from("user_settings").select("settings").eq("user_id", USERS.ava.id).single();
    expect(data?.settings).toMatchObject({ theme: "system" });
  });

  it("is closed to signed-out visitors", async () => {
    const r = await anon().from("user_settings").select("user_id");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
  });
});
