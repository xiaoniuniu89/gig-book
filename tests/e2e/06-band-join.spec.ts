import { expect, expectClean, go, musician, test, unique } from "./helpers";

test("6. joining by invite link asks what the band may see, and the People tab respects the answer", async ({ browser }, info) => {
  const ava = await musician(browser, "ava", info.project);
  const fay = await musician(browser, "fay", info.project);
  const name = unique("Link Band", info.project.name);

  // Ava makes a band and an invite link
  await go(ava.page, "/bands");
  await ava.page.getByRole("button", { name: "New band" }).click();
  await ava.page.getByLabel("Band name").fill(name);
  await ava.page.getByRole("button", { name: "Create band" }).click();
  await expect(ava.page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await ava.page.getByRole("tab", { name: "People" }).click();
  await ava.page.getByRole("button", { name: "Make an invite link" }).click();
  const link = (await ava.page.locator("code.epk-url").first().textContent())!.trim();
  expect(link).toMatch(/\/bands\/join\/[0-9a-f]{64}$/);

  // Fay opens it (what she plays comes from her account; joining doesn't ask)
  await fay.page.goto(link);
  await expect(fay.page.getByRole("heading", { name: `Join ${name}?` })).toBeVisible();
  await fay.page.getByRole("button", { name: `Join ${name}`, exact: true }).click();

  // the contact-sharing prompt: her phone follows "My bands" (on), her bio doesn't (off). She flips both.
  const form = fay.page.locator(".share-form");
  await expect(form).toBeVisible();
  const bio = form.getByRole("checkbox", { name: /Bio/ });
  const phone = form.getByRole("checkbox", { name: /Phone/ });
  await expect(phone).toBeChecked();
  await expect(bio).not.toBeChecked();
  await bio.check();
  await phone.uncheck();
  await form.getByRole("checkbox", { name: /Instruments/ }).check(); // what she plays shows under People only if she shares it
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(fay.page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // Ava's People tab: Fay is in, with her instruments and bio but without her phone
  await ava.page.reload();
  await ava.page.getByRole("tab", { name: "People" }).click();
  const block = ava.page.locator(".member-block", { hasText: "Fay" });
  await expect(block).toContainText("Trumpet");
  await block.getByText("Contact and bio").click();
  await expect(block).toContainText("Fay plays trumpet.");
  await expect(block).not.toContainText("555 0106");

  // the link is reusable until switched off; once it is off, it is "not valid"
  await ava.page.getByRole("button", { name: "Switch off all links" }).click();
  const eli = await musician(browser, "eli", info.project);
  await eli.page.goto(link);
  await expect(eli.page.getByRole("heading", { name: "Invite not valid" })).toBeVisible();

  expectClean(ava.page, fay.page, eli.page);
  await Promise.all([ava, fay, eli].map(m => m.ctx.close()));
});
