import { expect, expectClean, go, musician, noHScroll, test, unique } from "./helpers";

test("4. Ava makes a band, adds Ben (instrument preselected) and a setlist; a multi-instrument player gets Add as", async ({ browser }, info) => {
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

  // add Ben: one instrument on his profile, so it is preselected
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByLabel("Find people").fill("Ben");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const found = page.locator(".member", { hasText: "Ben" });
  await expect(found.locator("summary")).toHaveText("Bass");
  await found.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".member-block", { hasText: "Ben" }).getByText("member", { exact: true })).toBeVisible();
  await expect(page.locator(".member-block", { hasText: "Ben" })).toContainText("Bass");
  await noHScroll(page);

  // put one of Ava's setlists in the band
  await page.getByRole("tab", { name: "Setlists" }).click();
  await page.getByLabel("Your setlist").selectOption({ label: "Ava Solo Ballads" });
  await page.getByRole("button", { name: "Add a setlist" }).click();
  await expect(page.locator("section.panel", { hasText: "Band setlists" }).getByText("Ava Solo Ballads")).toBeVisible();

  // Dev starts his own band and looks for Ava, who plays piano and vocals: no guess, "Add as" lists both
  const d = dev.page;
  await go(d, "/bands");
  await d.getByRole("button", { name: "New band" }).click();
  await d.getByLabel("Band name").fill(unique("Dev Trio", info.project.name));
  await d.getByRole("button", { name: "Create band" }).click();
  await d.getByRole("tab", { name: "People" }).click();
  await d.getByLabel("Find people").fill("Ava");
  await d.getByRole("button", { name: "Search", exact: true }).click();
  const ava2 = d.locator(".member", { hasText: "Ava" });
  await expect(ava2.getByText("Add as")).toBeVisible();
  await expect(ava2.locator("summary")).toHaveText("Choose…");
  await ava2.locator("summary").click();
  await expect(ava2.getByLabel("Piano")).not.toBeChecked();
  await expect(ava2.getByLabel("Vocals")).not.toBeChecked();
  await expect(ava2.locator(".multi-list label")).toHaveCount(2);
  await ava2.getByLabel("Piano").check();
  await expect(ava2.locator("summary")).toHaveText("Piano");
  await noHScroll(d);
  expectClean(page, d);
  await ava.ctx.close(); await dev.ctx.close();
});
