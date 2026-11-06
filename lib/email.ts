// Plain transactional email through Resend's HTTP API (no SDK). Without RESEND_API_KEY nothing is sent.

export const EMAIL_KINDS = ["added_to_setlist", "added_to_gig", "added_to_band", "reply_to_note"] as const;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ENTITIES[c]);

/** Subject and body for a notification; null for kinds that never email. */
export function composeEmail(kind: string, actor: string, setlistName: string, link: string): { subject: string; text: string; html: string } | null {
  const gig = kind === "added_to_gig", band = kind === "added_to_band";
  const thing = gig ? "gig" : band ? "band" : "setlist";
  const who = actor || "Someone", name = setlistName || "a " + thing;
  const line = kind === "added_to_setlist" ? `${who} added you to the setlist "${name}".`
    : gig ? `${who} added you to the lineup of the gig "${name}".`
    : band ? `${who} added you to the band "${name}".`
    : kind === "reply_to_note" ? `${who} replied to your note on "${name}".` : "";
  if (!line) return null;
  const foot = "You can choose which emails you get in Settings.";
  return {
    subject: kind === "reply_to_note" ? `${who} replied to your note on "${name}"` : `${who} added you to "${name}"`,
    text: `${line}\n\nOpen it: ${link}\n\n${foot}\n`,
    html: `<p>${esc(line)}</p><p><a href="${esc(link)}">Open the ${thing}</a></p><p style="color:#666;font-size:13px">${foot}</p>`,
  };
}

/** Whether this person wants an email for this kind. Each "added" kind has its own switch; the older all-in-one emailAdded
 *  is the default for them. Replies are off unless switched on. */
export function wantsEmail(kind: string, s: Record<string, unknown>): boolean {
  const added = s.emailAdded !== false;
  const own = (k: string) => typeof s[k] === "boolean" ? s[k] as boolean : added;
  return kind === "added_to_setlist" ? own("emailSetlist") : kind === "added_to_gig" ? own("emailGig") : kind === "added_to_band" ? own("emailBand")
    : kind === "reply_to_note" ? s.emailReplies === true : false;
}

export type SendResult = "sent" | "skipped" | "failed";

export async function sendEmail(to: string, m: { subject: string; text: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return "skipped";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: m.subject, text: m.text, html: m.html }),
    });
    if (!r.ok) console.warn("resend " + r.status);
    return r.ok ? "sent" : "failed";
  } catch { return "failed"; }
}
