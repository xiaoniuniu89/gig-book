// Plain transactional email through Resend's HTTP API (no SDK). Without RESEND_API_KEY nothing is sent.

export const EMAIL_KINDS = ["added_to_setlist", "reply_to_note"] as const;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ENTITIES[c]);

/** Subject and body for a notification; null for kinds that never email. */
export function composeEmail(kind: string, actor: string, setlistName: string, link: string): { subject: string; text: string; html: string } | null {
  const who = actor || "Someone", name = setlistName || "a setlist";
  const line = kind === "added_to_setlist" ? `${who} added you to the setlist "${name}".`
    : kind === "reply_to_note" ? `${who} replied to your note on "${name}".` : "";
  if (!line) return null;
  const foot = "You can turn these emails off in Settings.";
  return {
    subject: kind === "added_to_setlist" ? `${who} added you to "${name}"` : `${who} replied to your note on "${name}"`,
    text: `${line}\n\nOpen it: ${link}\n\n${foot}\n`,
    html: `<p>${esc(line)}</p><p><a href="${esc(link)}">Open the setlist</a></p><p style="color:#666;font-size:13px">${foot}</p>`,
  };
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
