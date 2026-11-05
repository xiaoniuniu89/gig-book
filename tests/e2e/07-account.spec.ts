import { USERS } from "../fixtures";
import { expect, expectClean, go, musician, test } from "./helpers";

test("7. changing who sees a phone number on the Account page changes the public press kit", async ({ browser }, info) => {
  const ava = await musician(browser, "ava", info.project);
  const visitor = await browser.newContext({ ...info.project.use, baseURL: "http://127.0.0.1:3000" }); // signed out
  const pub = await visitor.newPage();
  const errors: string[] = [];
  pub.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const phone = USERS.ava.contact.phone;

  // Account > Contact > the pencil on Phone opens it with its "who can see it" picker
  const openPhone = async () => {
    await go(ava.page, "/account");
    await ava.page.getByRole("tab", { name: "Contact" }).click();
    await ava.page.getByRole("button", { name: "Edit Phone" }).click();
    await expect(ava.page.getByLabel("Phone", { exact: true })).toHaveValue(phone);
  };
  const setPhone = async (who: "Public" | "Only me") => {
    await openPhone();
    await ava.page.getByLabel("Who can see Phone").selectOption({ label: who });
    await ava.page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ava.page.getByRole("button", { name: "Edit Phone" })).toBeVisible(); // saved and closed
  };

  try {
    // before: phone is private, the website is public
    await go(pub, "/epk/ava-music");
    await expect(pub.getByRole("heading", { name: "Ava", level: 1 })).toBeVisible();
    await expect(pub.getByText("ava.example.test")).toBeVisible();
    await expect(pub.getByText(phone)).toHaveCount(0);
    await expect(pub.getByText("ava@example.test")).toHaveCount(0); // shared with bands only

    await setPhone("Public");
    await pub.reload();
    await expect(pub.getByRole("link", { name: phone })).toBeVisible();

    await setPhone("Only me");
    await pub.reload();
    await expect(pub.getByText(phone)).toHaveCount(0);
    await expect(pub.getByText("ava.example.test")).toBeVisible();
  } finally {
    // leave Ava as the seed made her, whatever happened above
    await openPhone();
    const sel = ava.page.getByLabel("Who can see Phone");
    if ((await sel.inputValue()) !== "private") { await sel.selectOption("private"); await ava.page.getByRole("button", { name: "Save", exact: true }).click(); }
  }

  // a page that doesn't exist is a plain 404 for a signed-out visitor
  const missing = await pub.goto("/epk/nobody-here");
  expect(missing?.status()).toBe(404);
  expect(errors.filter(e => !/404/.test(e))).toEqual([]);
  expectClean(ava.page);
  await ava.ctx.close(); await visitor.close();
});
