import { IDS } from "../fixtures";
import { expect, expectClean, go, musician, noHScroll, test, unique } from "./helpers";

const SET = `/set/${IDS.avaTrioSet}`;
const BAND = `/bands/${IDS.avaTrio}`;

test("5. band members see and do exactly what their permissions allow; outsiders get 'not found'", async ({ browser }, info) => {
  const [ava, ben, cleo, eli] = await Promise.all((["ava", "ben", "cleo", "eli"] as const).map(w => musician(browser, w, info.project)));

  // Ben has edit_setlists: the band setlist is his to change
  await go(ben.page, BAND);
  await ben.page.locator("a", { hasText: "Ava Trio Book" }).first().click();
  await expect(ben.page.getByRole("heading", { name: "Ava Trio Book", level: 1 })).toBeVisible();
  await expect(ben.page.getByRole("button", { name: "Add tunes" })).toBeVisible();
  const tunes = ben.page.locator("section[aria-label='Set 1'] .tune");
  const before = await tunes.count();
  await ben.page.getByRole("button", { name: "Add tunes" }).click();
  await ben.page.getByPlaceholder("Search title, composer or style").fill("Anthropology");
  await ben.page.locator(".sheet-list label.pick", { hasText: "Anthropology" }).first().click();
  await ben.page.getByRole("button", { name: /^Add 1( to set 1)?$/ }).click();
  await expect(tunes).toHaveCount(before + 1);
  // ...and put it back
  const remove = tunes.last().getByRole("button", { name: "Remove" });
  await remove.click(); // arms ("Remove?"), the second click removes
  const saved = ben.page.waitForResponse(r => r.url().includes("replace_setlist_items") && r.ok());
  await remove.click();
  await saved;
  await expect(tunes).toHaveCount(before);
  await expect(ben.page.getByRole("button", { name: "Delete this setlist" })).toHaveCount(0); // not the owner
  await noHScroll(ben.page);

  // Cleo (default permissions): reads, posts a band note, sees no edit controls
  await go(cleo.page, SET);
  await expect(cleo.page.getByRole("heading", { name: "Ava Trio Book", level: 1 })).toBeVisible();
  for (const n of ["Add tunes", "Rename setlist", "Move down", "Move up", "Remove", "Delete this setlist"]) await expect(cleo.page.getByRole("button", { name: n })).toHaveCount(0);
  await go(cleo.page, BAND);
  await cleo.page.getByRole("tab", { name: "Notes" }).click();
  const text = unique("Load-in at 5", info.project.name);
  await cleo.page.getByRole("button", { name: "Add note" }).click();
  await cleo.page.getByLabel("New note").fill(text);
  await cleo.page.getByRole("dialog").getByRole("button", { name: "Add note" }).click();
  await expect(cleo.page.getByText(text)).toBeVisible();
  await cleo.page.getByRole("tab", { name: "People" }).click();
  await expect(cleo.page.getByText("Ava (you)")).toHaveCount(0);
  await expect(cleo.page.getByRole("button", { name: /Make (admin|member)/ })).toHaveCount(0);
  await expect(cleo.page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0); // no invite permission
  await expect(cleo.page.getByRole("heading", { name: "Band settings" })).toHaveCount(0);

  // Ava (admin, second context) sees Cleo's note straight away
  await go(ava.page, BAND);
  await ava.page.getByRole("tab", { name: "Notes" }).click();
  await expect(ava.page.getByText(text)).toBeVisible();

  // Eli is not in the band: nothing at all
  await go(eli.page, BAND);
  await expect(eli.page.getByRole("heading", { name: "STOP!!!!" })).toBeVisible();
  await go(eli.page, SET);
  await expect(eli.page.getByRole("heading", { name: "STOP!!!!" })).toBeVisible();
  await expect(eli.page.getByText("Ava Trio Book")).toHaveCount(0);
  await go(eli.page, "/bands");
  await expect(eli.page.getByText("No bands yet")).toBeVisible();

  expectClean(ava.page, ben.page, cleo.page, eli.page);
  await Promise.all([ava, ben, cleo, eli].map(m => m.ctx.close()));
});
