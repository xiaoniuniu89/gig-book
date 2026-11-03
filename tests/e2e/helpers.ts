import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { MAILPIT } from "../env";
import { USERS, type Who } from "../fixtures";

/** Nothing outside this machine is reached: YouTube/Spotify embeds and the like get an empty page. */
async function isolate(ctx: BrowserContext) {
  await ctx.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.href) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob"),
    r => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body></body></html>" }));
}

/** The newest magic link mailed to `email` (via the local Mailpit). */
async function magicLink(email: string, after: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`).then(r => r.json()) as { messages?: { ID: string; Created: string }[] };
    const m = (list.messages ?? []).find(x => new Date(x.Created).getTime() >= after - 2000);
    if (m) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then(r => r.json()) as { Text: string; HTML: string };
      const link = /https?:\/\/[^\s"<>]*\/auth\/v1\/verify\?[^\s"<>]+/.exec((full.Text || "") + " " + (full.HTML || ""));
      if (link) return link[0].replace(/&amp;/g, "&");
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("No sign-in email arrived for " + email);
}

/** Sign in through the real sign-in page: ask for a link, open the mailed link. */
export async function signIn(page: Page, who: Who) {
  const email = USERS[who].email;
  const started = Date.now();
  await go(page, "/");
  await page.locator("#signin-email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await magicLink(email, started));
  await expect(page.getByRole("heading", { name: `Welcome back, ${USERS[who].name}` })).toBeVisible();
}

/** A fresh browser context signed in as `who`. */
export async function musician(browser: Browser, who: Who, project: { use: { viewport?: { width: number; height: number } | null; isMobile?: boolean; hasTouch?: boolean; deviceScaleFactor?: number } }) {
  const ctx = await browser.newContext({ ...project.use, baseURL: "http://127.0.0.1:3000" });
  await isolate(ctx);
  const page = await ctx.newPage();
  watch(page);
  await signIn(page, who);
  return { ctx, page };
}

const errors = new WeakMap<Page, string[]>();
/** Collect console errors and uncaught exceptions on `page`. */
export function watch(page: Page) {
  const list: string[] = [];
  errors.set(page, list);
  page.on("console", m => { if (m.type() === "error") list.push(`console: ${m.text()}`); });
  page.on("pageerror", e => list.push(`exception: ${e.message}`));
}

/** The page has no sideways scroll. */
export async function noHScroll(page: Page) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  expect(w.doc, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(w.win);
}

/** Open a path, wait for it to settle and check the layout. */
export async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await noHScroll(page);
}

/** Fails the test if the page logged console errors (called at the end of each flow). */
export function expectClean(...pages: Page[]) {
  for (const p of pages) expect(errors.get(p) ?? [], "console errors").toEqual([]);
}

/** A name that is unique per run and per project, so reruns never collide. */
export const unique = (base: string, project: string) => `${base} ${project} ${Date.now().toString(36)}`;

export const test = base.extend<{ page: Page }>({
  page: async ({ context, page }, provide) => { // (not named `use`: eslint takes that for a React hook)
    await isolate(context);
    watch(page);
    await provide(page);
  },
});
export { expect };
