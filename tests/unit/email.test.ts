import { describe, expect, it } from "vitest";
import { composeEmail, sendEmail, wantsEmail } from "@/lib/email";

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

describe("band emails and who wants what", () => {
  it("writes the band email with a link to the band", () => {
    const m = composeEmail("added_to_band", "Dan", "Cormac Kenny Trio", "https://x.test/bands/1")!;
    expect(m.subject).toBe('Dan added you to "Cormac Kenny Trio"');
    expect(m.text).toContain('added you to the band "Cormac Kenny Trio"');
    expect(m.html).toContain("Open the band");
  });
  it("each kind has its own switch, defaulting to the old all-in-one one; replies are opt-in", () => {
    expect(wantsEmail("added_to_band", {})).toBe(true);
    expect(wantsEmail("added_to_band", { emailAdded: false })).toBe(false);
    expect(wantsEmail("added_to_band", { emailAdded: false, emailBand: true })).toBe(true);
    expect(wantsEmail("added_to_gig", { emailGig: false })).toBe(false);
    expect(wantsEmail("added_to_setlist", { emailGig: false })).toBe(true);
    expect(wantsEmail("reply_to_note", {})).toBe(false);
    expect(wantsEmail("reply_to_note", { emailReplies: true })).toBe(true);
    expect(wantsEmail("note_on_setlist", {})).toBe(false);
  });
});
