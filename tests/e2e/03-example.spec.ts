import { expect, expectClean, go, signIn, test } from "./helpers";

test("3. an example setlist can't be edited; Make a copy gives an editable one", async ({ page }) => {
  await signIn(page, "ava");
  await go(page, "/setlists");
  await page.locator("a.book[href='/set/builtin-billie-holiday']").click();
  await expect(page.getByRole("heading", { name: "Billie Holiday Short Setlist", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make a copy" })).toBeVisible();
  for (const name of ["Add tunes", "Rename setlist"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  await expect(page.locator(".tune").getByRole("button", { name: /^More for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete this setlist" })).toHaveCount(0);

  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page.getByRole("heading", { name: "Billie Holiday Short Setlist (copy)", level: 1 })).toBeVisible();
  await expect(page).not.toHaveURL(/builtin-/);
  await expect(page.getByRole("button", { name: "Add tunes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename setlist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make a copy" })).toHaveCount(0);
  await expect(page.locator("section[aria-label='Set 1'] .tune").first().getByRole("button", { name: /^More for/ })).toBeVisible();
  expectClean(page);
});
