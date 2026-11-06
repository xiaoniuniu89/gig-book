// Shared form checks: links, files and plain-sentence server errors.

import { CONTACT_FIELDS } from "./data/types";
import { cleanUrl } from "./resources";

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/** Contact/link fields tidied for saving: trimmed, empties dropped, `https://` added to links that look like a site (handles like @name are left alone). */
export function tidyContact(contact: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(contact)) {
    let v = raw.trim();
    if (!v) continue;
    if (CONTACT_FIELDS.find(f => f.key === k)?.kind === "url" && !/^[a-z][a-z0-9+.-]*:/i.test(v) && v.includes(".") && !/\s/.test(v)) v = cleanUrl(v) || v;
    out[k] = v;
  }
  return out;
}

/** A sentence naming the first contact field that's wrong (a bad email), or null. */
export function contactProblem(contact: Record<string, string>): string | null {
  const e = contact.email?.trim();
  return e && !isEmail(e) ? "The email address doesn't look right." : null;
}

const mb =(n: number) => n + " MB";

/** Check a file before upload; returns a short sentence naming the limit, or null if fine. */
export function checkFile(f: File, opt: { maxMB: number; types?: RegExp; typeName?: string; exts?: RegExp }): string | null {
  const okType = !opt.types || opt.types.test(f.type) || (!!opt.exts && opt.exts.test(f.name));
  if (!okType) return `${f.name} isn't allowed here. ${opt.typeName ? "Use " + opt.typeName + "." : ""}`.trim();
  if (f.size > opt.maxMB * 1024 * 1024) return `${f.name} is over the ${mb(opt.maxMB)} limit.`;
  if (f.size === 0) return `${f.name} is empty.`;
  return null;
}

/** A server error as a plain sentence. Our own raised messages (plain English) pass through; Postgres/Supabase text never does. */
export function plainError(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message || "";
  const code = error?.code || "";
  if (code === "23514") return "One of the fields is too long or isn't allowed.";
  if (code === "23505") return "That already exists.";
  if (code === "23503") return "That is linked to something that has gone.";
  if (code === "23502") return "A required field is missing.";
  if (code === "42501" || /row-level security|permission denied/i.test(m)) return "You don't have permission to do that.";
  if (/failed to fetch|networkerror|network request|load failed/i.test(m)) return "No connection. Check your internet and try again.";
  if (/jwt|not authenticated|invalid token/i.test(m)) return "Sign in again and retry.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a moment and try again.";
  // our own `raise exception 'Plain sentence.'` (P0001 / 22023): keep, unless it looks technical
  if ((code === "P0001" || code === "22023") && m && !/violates|constraint|relation|function|syntax|column|_/.test(m)) return m;
  return "Something went wrong. Try again.";
}
