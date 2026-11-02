import { expect, expectClean, go, noHScroll, signIn, test } from "./helpers";

test("8. a starter lick renders as notation, changes key, and loops with the band", async ({ page }) => {
  await signIn(page, "eli");
  await go(page, "/licks");
  await page.getByRole("tab", { name: /Starter licks/ }).click();
  await page.getByText("Bird ii–V–I in F").first().click();
  await expect(page.getByRole("heading", { name: "Bird ii–V–I in F", level: 1 })).toBeVisible();

  // notation is drawn (abcjs, in the page)
  const sheet = page.locator(".lick-sheet");
  await expect(sheet.locator("svg").first()).toBeVisible();
  const before = await sheet.locator("svg").first().innerHTML();

  // another key: the same lick is drawn again, moved
  await sheet.getByRole("combobox").selectOption("G");
  await expect.poll(async () => await sheet.locator("svg").first().innerHTML()).not.toBe(before);
  await expect(sheet.getByRole("combobox")).toHaveValue("G");
  await noHScroll(page);

  // loop with the band (samples are served by the app itself)
  const chords = page.locator(".lick-chords"); // the dock has its own Stop button
  await chords.getByRole("button", { name: "Loop with the band" }).click();
  await expect(chords.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#band-status")).toHaveText(/bar \d+/, { timeout: 45_000 });
  await chords.getByRole("button", { name: "Stop" }).click();
  await expect(chords.getByRole("button", { name: "Loop with the band" })).toBeVisible();
  expectClean(page);
});
