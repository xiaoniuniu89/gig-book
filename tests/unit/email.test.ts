import { describe, expect, it } from "vitest";
import { composeEmail, sendEmail } from "@/lib/email";

describe("email", () => {
  it("writes a short invite email with the link", () => {
    const m = composeEmail("added_to_setlist", "Ava", "Friday <gig>", "https://x.test/set/1")!;
    expect(m.subject).toBe('Ava added you to "Friday <gig>"');
    expect(m.text).toContain("https://x.test/set/1");
    expect(m.html).toContain("Friday &lt;gig&gt;");
  });
  it("has nothing for other kinds", () => expect(composeEmail("note_on_setlist", "A", "S", "l")).toBeNull());
  it("skips quietly without a key", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail("a@b.c", { subject: "s", text: "t", html: "h" })).toBe("skipped");
  });
});
