import { TINY_PDF } from "../fixtures";
import { expect, expectClean, go, noHScroll, signIn, test, unique } from "./helpers";

test("9. resources: a YouTube link embeds, a PDF uploads, and attached to a tune they show on that tune", async ({ page }, info) => {
  await signIn(page, "eli");
  const linkTitle = unique("Cannonball solo", info.project.name);
  const pdfTitle = unique("Changes", info.project.name);

  // a YouTube link (the player itself is stubbed: no network beyond this machine)
  await go(page, "/resources");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save a link" }).click();
  await page.getByLabel("Link address").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByLabel("Title").fill(linkTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(linkTitle).first().click();
  await expect(page.getByRole("heading", { name: linkTitle, level: 1 })).toBeVisible();
  await expect(page.locator("iframe.res-embed.youtube")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await noHScroll(page);

  // attach it to a tune
  await page.getByRole("button", { name: "Attach to a tune" }).click();
  await page.getByLabel("Search tunes").fill("Autumn Leaves");
  await page.locator(".pick-row", { hasText: "Autumn Leaves" }).first().click();
  await expect(page.getByText("Attached.")).toBeVisible();

  // a PDF
  await go(page, "/resources");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Upload a PDF or file" }).click();
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "changes.pdf", mimeType: "application/pdf", buffer: Buffer.from(TINY_PDF) });
  await page.getByLabel("Title").fill(pdfTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(pdfTitle).first().click();
  await expect(page.getByRole("heading", { name: pdfTitle, level: 1 })).toBeVisible();
  await expect(page.getByText("changes.pdf").first()).toBeVisible();
  await page.getByRole("button", { name: "Attach to a tune" }).click();
  await page.getByLabel("Search tunes").fill("Autumn Leaves");
  await page.locator(".pick-row", { hasText: "Autumn Leaves" }).first().click();
  await expect(page.getByText("Attached.")).toBeVisible();

  // both show on the tune
  await go(page, "/library");
  await page.getByPlaceholder(/^Search/).fill("Autumn Leaves");
  await page.locator("#lib-list a.tune", { hasText: "Autumn Leaves" }).first().click();
  await page.getByRole("tab", { name: "Resources" }).click();
  const mine = page.getByRole("region", { name: "My resources on this song" });
  await expect(mine).toContainText(linkTitle);
  await expect(mine).toContainText(pdfTitle);
  await noHScroll(page);
  expectClean(page);
});
