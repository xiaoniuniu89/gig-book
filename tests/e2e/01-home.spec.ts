import { expect, expectClean, go, noHScroll, signIn, test } from "./helpers";

test("1. sign in, Home welcomes Ava with the five tiles", async ({ page }) => {
  await signIn(page, "ava");
  for (const name of ["Setlists", "Library", "Licks", "Resources", "Bands"]) {
    await expect(page.locator(".shelf .book .t", { hasText: new RegExp(`^${name}$`) })).toBeVisible();
  }
  await noHScroll(page);
  // every top-level page opens without errors or sideways scroll
  for (const [path, heading] of [["/setlists", "Setlists"], ["/library", "Library"], ["/licks", "Licks"], ["/resources", "Resources"], ["/bands", "Bands"], ["/account", "Account"]]) {
    await go(page, path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  expectClean(page);
});
