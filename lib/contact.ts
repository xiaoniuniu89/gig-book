// Links for contact values on the public press kit page and the band People tab.

/** A link for a contact value, or null when it isn't safe to link (only http(s), tel and mailto). */
export function hrefFor(key: string, v: string): string | null {
  if (key === "phone") return "tel:" + v.replace(/[^\d+]/g, "");
  if (key === "email") return "mailto:" + v;
  if (key === "whatsapp") { const d = v.replace(/\D/g, ""); return d ? "https://wa.me/" + d : null; }
  const u = /^https?:\/\//i.test(v) ? v : "https://" + v;
  try { return ["http:", "https:"].includes(new URL(u).protocol) ? u : null; } catch { return null; }
}
