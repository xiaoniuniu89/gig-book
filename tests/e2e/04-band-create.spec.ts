import { expect, expectClean, go, musician, noHScroll, test, unique } from "./helpers";

test("4. Ava makes a band, adds Ben and a setlist; people show the instruments from their account", async ({ browser }, info) => {
  const ava = await musician(browser, "ava", info.project);
  const dev = await musician(browser, "dev", info.project);
  const { page } = ava;
  const name = unique("Ava Quintet", info.project.name);

  await go(page, "/bands");
  await page.getByRole("button", { name: "New band" }).click();
  await page.getByLabel("Band name").fill(name);
  await page.getByRole("button", { name: "Create band" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Band · admin")).toBeVisible();

  // add Ben: what he plays comes from his account (he shares it with bands)
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByLabel("Find people").fill("Ben");
  await page.getByRole("option", { name: /^Ben/ }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".member-block", { hasText: "Ben" }).getByText("member", { exact: true })).toBeVisible();
  await expect(page.locator(".member-block", { hasText: "Ben" })).toContainText("Bass");
  await noHScroll(page);

  // put one of Ava's setlists in the band
  await page.getByRole("tab", { name: "Setlists" }).click();
  await page.getByRole("button", { name: "Share one of yours" }).click();
  await page.getByRole("dialog").locator(".member", { hasText: "Ava Solo Ballads" }).getByRole("button", { name: "Share" }).click();
  await expect(page.locator("section.panel", { hasText: "Band setlists" }).getByText("Ava Solo Ballads")).toBeVisible();

  // Dev starts his own band and adds Ava: her instruments come from her account, nobody picks them
  const d = dev.page;
  await go(d, "/bands");
  await d.getByRole("button", { name: "New band" }).click();
  await d.getByLabel("Band name").fill(unique("Dev Trio", info.project.name));
  await d.getByRole("button", { name: "Create band" }).click();
  await d.getByRole("tab", { name: "People" }).click();
  await d.getByLabel("Find people").fill("Ava");
  await d.getByRole("option", { name: /^Ava/ }).click();
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await expect(d.locator(".member-block", { hasText: "Ava" })).toContainText("Piano");
  await expect(d.getByRole("button", { name: "Change what you play in this band" })).toHaveCount(0);
  await noHScroll(d);
  expectClean(page, d);
  await ava.ctx.close(); await dev.ctx.close();
});
