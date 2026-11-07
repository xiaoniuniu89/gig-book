// Opens a link the player picked and gets something AI can read from it. Server only.
// The link is untrusted: public http(s) addresses only (checked again on every redirect), small, and short on time. Nothing is kept.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AiError } from "./draft";
import { MAX_AI_FILE, type LeadSheetSource } from "./leadsheet";

const MAX_TEXT = 40000;
const HOPS = 3;
const none = () => new AiError("Couldn't find a chart we can read there. Try another result.", 422);

/** False for loopback, private, link-local, carrier-grade NAT, reserved and multicast addresses. */
export function isPublicIp(ip: string): boolean {
  const v6 = ip.toLowerCase();
  const v4 = isIP(ip) === 4 ? ip : /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(v6) ? v6.slice(7) : null;
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(ip) !== 6) return false;
  return /^[23]/.test(v6) && !v6.startsWith("2001:db8"); // global unicast only
}

/** A URL we're willing to open, or null. */
export function cleanLink(text: string): URL | null {
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return null;
  return u;
}

/** What the first bytes say a file is. */
export function sniff(b: Uint8Array): "pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  const s = String.fromCharCode(...b.subarray(0, 12));
  if (s.startsWith("%PDF")) return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (s.startsWith("\x89PNG")) return "image/png";
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The likeliest PDF link on a page, by its address and the words on it. */
export function pdfLinkIn(html: string, base: URL): URL | null {
  const found: { u: URL; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let u: URL | null = null;
    try { u = cleanLink(new URL(m[1], base).href); } catch { /* skipped */ }
    if (u) found.push({ u, score: /\bin c\b|concert|lead|chart/i.test(m[1] + m[2]) ? 1 : 0 });
  }
  return found.sort((a, b) => b.score - a.score)[0]?.u ?? null;
}

/** A page's words, without its code. */
export function pageText(html: string): string {
  return html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, MAX_TEXT);
}

async function get(start: URL): Promise<{ bytes: Uint8Array; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= HOPS; hop++) {
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) ? !isPublicIp(url.hostname.replace(/^\[|\]$/g, "")) : (await lookup(url.hostname, { all: true })).some(a => !isPublicIp(a.address))) throw none();
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; NiuRealBook)", Accept: "application/pdf,image/*,text/html;q=0.9" } });
    if (res.status >= 300 && res.status < 400) {
      const next = cleanLink(new URL(res.headers.get("location") || "", url).href);
      await res.body?.cancel();
      if (!next) throw none();
      url = next;
      continue;
    }
    if (!res.ok || !res.body) { await res.body?.cancel(); throw new AiError("That site wouldn't let us open it. Try another result.", 422); }
    if (Number(res.headers.get("content-length") || 0) > MAX_AI_FILE) { await res.body.cancel(); throw new AiError("That file is too big for AI to read. Try another result.", 413); }
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += c.length;
      if (size > MAX_AI_FILE) throw new AiError("That file is too big for AI to read. Try another result.", 413);
      parts.push(c);
    }
    return { bytes: Buffer.concat(parts), url };
  }
  throw none();
}

const asFile = (bytes: Uint8Array): LeadSheetSource | null => {
  const kind = sniff(bytes);
  if (!kind) return null;
  const b64 = Buffer.from(bytes).toString("base64");
  return kind === "pdf" ? { pdf: b64 } : { image: b64, mime: kind };
};

export async function openSheetLink(link: string): Promise<LeadSheetSource> {
  const u = cleanLink(link);
  if (!u) throw none();
  try {
    const first = await get(u);
    const file = asFile(first.bytes);
    if (file) return file;
    const html = Buffer.from(first.bytes).toString("utf8");
    const pdf = pdfLinkIn(html, first.url);
    if (pdf) {
      const inner = await get(pdf).then(r => asFile(r.bytes), () => null);
      if (inner) return inner;
    }
    const text = pageText(html);
    if (text.length < 40) throw none();
    return { text };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("Couldn't open that link. Try another result.", 502);
  }
}
