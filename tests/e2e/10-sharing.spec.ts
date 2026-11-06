import { expect, expectClean, go, musician, noHScroll, test, unique } from "./helpers";

test("10. Ava shares a setlist with Bands I'm in; Ben (her bandmate) finds it under From your bands and reads it", async ({ browser }, info) => {
  const ava = await musician(browser, "ava", info.project);
  const ben = await musician(browser, "ben", info.project);
  const name = unique("Ava Bandmates Set", info.project.name);

  // Ava makes a setlist with one tune and sets who can see it
  await go(ava.page, "/setlists");
  await ava.page.getByRole("button", { name: "New setlist" }).click();
  await ava.page.getByLabel("Setlist name").fill(name);
  await ava.page.getByRole("button", { name: "Create" }).click();
  await expect(ava.page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await ava.page.getByRole("button", { name: "Add tunes" }).click();
  await ava.page.getByPlaceholder("Search title, composer or style").fill("Anthropology");
  await ava.page.locator(".sheet-list label.pick", { hasText: "Anthropology" }).first().click();
  await ava.page.getByRole("button", { name: /^Add 1( to set 1)?$/ }).click();
  await expect(ava.page.locator("section[aria-label='Set 1'] .tune")).toHaveCount(1);
  const saved = ava.page.waitForResponse(r => r.url().includes("setlists") && r.request().method() === "PATCH" && r.ok());
  await ava.page.getByRole("button", { name: "Who can see it" }).click();
  await ava.page.getByRole("dialog").getByRole("combobox", { name: "Who can see it" }).selectOption("bands");
  await saved;
  await expect(ava.page.getByRole("dialog").getByRole("button", { name: /Add (a person|by email)/ })).toHaveCount(0);

  // Ben finds it under From your bands and opens it read-only
  await go(ben.page, "/setlists");
  await expect(ben.page.getByRole("heading", { name: "From your bands" })).toBeVisible();
  await ben.page.locator("a.book", { hasText: name }).click();
  await expect(ben.page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(ben.page.locator("section[aria-label='Set 1'] .tune")).toHaveCount(1);
  for (const n of ["Add tunes", "Rename setlist", "Move down", "Move up", "Remove", "Delete this setlist", "Who can see it"]) await expect(ben.page.getByRole("button", { name: n })).toHaveCount(0);
  await expect(ben.page.getByRole("heading", { name: "Setlist notes" })).toHaveCount(0);
  await expect(ben.page.getByRole("button", { name: "Save to my setlists" })).toBeVisible();
  await noHScroll(ben.page);

  // he can keep his own copy
  await ben.page.getByRole("button", { name: "Save to my setlists" }).click();
  await expect(ben.page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(ben.page.getByRole("button", { name: "Add tunes" })).toBeVisible();

  expectClean(ava.page, ben.page);
  await ava.ctx.close(); await ben.ctx.close();
});
