import { expect, expectClean, go, noHScroll, signIn, test, unique } from "./helpers";

test("2. build a setlist from the library, reorder it, open the chart view and swipe on", async ({ page }, info) => {
  await signIn(page, "ava");
  const name = unique("Friday", info.project.name);
  await go(page, "/setlists");
  await page.getByRole("button", { name: "New setlist" }).click();
  await page.getByLabel("Setlist name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // add two tunes from the library
  for (const tune of ["Autumn Leaves", "Blue Bossa"]) {
    await page.getByRole("button", { name: "Add tunes" }).click();
    await page.getByPlaceholder("Search title, composer or style").fill(tune);
    await page.locator(".sheet-list label.pick", { hasText: tune }).first().click();
    await page.getByRole("button", { name: /^Add 1 to set 1/ }).click();
  }
  const names = () => page.locator("section[aria-label='Set 1'] .tune .name").evaluateAll(els => els.map(e => e.childNodes[0].textContent));
  await expect.poll(names).toEqual(["Autumn Leaves", "Blue Bossa"]);

  // reorder: move the first tune down
  await page.waitForTimeout(1000); // let the saves for the two additions finish first
  const saved = page.waitForResponse(r => r.url().includes("replace_setlist_items") && r.ok());
  await page.locator("section[aria-label='Set 1'] .tune").first().getByRole("button", { name: "Move down" }).click();
  await expect.poll(names).toEqual(["Blue Bossa", "Autumn Leaves"]);
  await saved; // edits are saved a moment after the last change
  await noHScroll(page);

  // it survives a reload (saved to the account)
  await page.reload();
  await expect.poll(names).toEqual(["Blue Bossa", "Autumn Leaves"]);

  // chart view: the whole chart fits without scrolling
  await page.locator("section[aria-label='Set 1'] .tune .name").first().click();
  await page.getByRole("link", { name: "Chart view" }).click();
  const focus = page.getByRole("region", { name: "Chart view" });
  await expect(focus.locator(".focus-title b")).toHaveText("Blue Bossa");
  await expect(focus.locator("#chart-wrap")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const fit = await page.evaluate(() => {
    const b = document.querySelector(".focus-body") as HTMLElement;
    return { sh: b.scrollHeight, ch: b.clientHeight, page: document.documentElement.scrollHeight, win: window.innerHeight };
  });
  expect(fit.sh).toBeLessThanOrEqual(fit.ch + 1);
  expect(fit.page).toBeLessThanOrEqual(fit.win + 1);
  await noHScroll(page);

  // swipe left to the next tune, then right to come back
  const box = (await focus.locator(".focus-body").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 8 });
  await page.mouse.up();
  await expect(focus.locator(".focus-title b")).toHaveText("Autumn Leaves");
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
  await page.mouse.up();
  await expect(focus.locator(".focus-title b")).toHaveText("Blue Bossa");
  expectClean(page);
});
