// Formatted bios (R11): HTML limited to p, br, strong, em, h3, ul, ol, li and a[href]. No DOM needed, so it runs
// on the server (public page) and in the browser. Sanitise on save and again on render.

const ALLOWED = new Set(["p", "br", "strong", "em", "h3", "ul", "ol", "li", "a"]);
const ALIAS: Record<string, string> = { b: "strong", i: "em", h1: "h3", h2: "h3", h4: "h3", h5: "h3", h6: "h3" };
/** Dropped with everything inside them. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "head", "title", "svg", "math", "textarea", "select", "button"]);
/** Other tags that break the text into a new paragraph; any tag not listed here is removed and its text kept. */
const BLOCKY = new Set(["div", "section", "article", "tr", "table", "blockquote", "pre", "hr", "dl", "dt", "dd", "header", "footer", "figure"]);

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  }
  return ENT[e.toLowerCase()] ?? m;
});
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A link we allow: https: or mailto: only. Returns the clean URL or null. */
export function safeHref(raw: string): string | null {
  const v = decode(raw).replace(/[\u0000- \u007f-\u009f]+/g, "");
  if (!/^(https:\/\/|mailto:)\S+$/i.test(v) || v.length > 2000) return null;
  return v;
}

// comment | tag (name in 2, attributes in 3) | other markup | text (4)
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9:]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>?|<[^>]*>|([^<]+|<)/g;
const HREF = /(?:^|[\s"'])href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Clean any HTML (pasted from Word or Google Docs, say) down to the allowed tags. */
export function sanitizeBio(html: string): string {
  const out: string[] = [];
  const open: string[] = []; // allowed tags still open
  let skip: string | null = null; // inside a dropped element
  let depth = 0;
  const top = () => open[open.length - 1];
  const inList = () => open.includes("ul") || open.includes("ol");
  const closeP = () => { while (open.length && top() !== "ul" && top() !== "ol" && top() !== "li") out.push("</" + open.pop() + ">"); };
  const ensureP = () => { if (!open.length) { out.push("<p>"); open.push("p"); } };
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html))) {
    if (m[4] !== undefined) {
      if (skip) continue;
      const t = decode(m[4]).replace(/\u0000/g, "").replace(/\s+/g, " ");
      if (!t.trim()) { if (open.length && top() !== "ul" && top() !== "ol") out.push(" "); continue; }
      if (top() === "ul" || top() === "ol") continue; // text between list items
      ensureP();
      out.push(escapeHtml(t));
      continue;
    }
    if (!m[2]) continue; // comment or junk
    const closing = !!m[1];
    let name = m[2].toLowerCase();
    if (skip) {
      if (name === skip) { if (closing) { if (--depth === 0) skip = null; } else depth++; }
      continue;
    }
    if (DROP.has(name)) { if (!closing && !/\/\s*$/.test(m[3] || "")) { skip = name; depth = 1; } continue; }
    name = ALIAS[name] || name;
    if (!ALLOWED.has(name)) {
      if (BLOCKY.has(name) && !inList()) closeP();
      continue;
    }
    if (closing) {
      const i = open.lastIndexOf(name);
      if (i < 0) continue;
      while (open.length > i) out.push("</" + open.pop() + ">");
      continue;
    }
    switch (name) {
      case "br": if (open.length && !inList()) out.push("<br>"); else if (!open.length) { /* nothing to break */ } break;
      case "p": case "h3":
        if (inList() || open.includes("h3")) break; // inside a list item or heading: just its text
        closeP(); out.push("<" + name + ">"); open.push(name); break;
      case "ul": case "ol":
        if (open.includes("li")) break; // no nesting
        closeP(); out.push("<" + name + ">"); open.push(name); break;
      case "li":
        if (!inList()) { closeP(); out.push("<ul>"); open.push("ul"); }
        while (top() !== "ul" && top() !== "ol") out.push("</" + open.pop() + ">");
        out.push("<li>"); open.push("li"); break;
      case "a": {
        if (open.includes("a")) break;
        const h = HREF.exec(" " + (m[3] || ""));
        const href = h ? safeHref(h[1] ?? h[2] ?? h[3] ?? "") : null;
        if (!href) break; // the text stays, the link goes
        ensureP();
        out.push('<a href="' + escapeHtml(href) + '" rel="noopener noreferrer nofollow">'); open.push("a"); break;
      }
      default: // strong, em
        if (!open.includes(name)) { ensureP(); out.push("<" + name + ">"); open.push(name); }
    }
  }
  while (open.length) out.push("</" + open.pop() + ">");
  let s = out.join("");
  for (let i = 0; i < 3; i++) s = s.replace(/<(p|h3|strong|em|li)>\s*<\/\1>/g, "");
  return s.replace(/<(p|h3|li)> /g, "<$1>").replace(/ <\/(p|h3|li)>/g, "</$1>").trim();
}

/** A bio as stored: plain text from before (paragraphs split on blank lines) or HTML. */
export function bioToHtml(bio: string): string {
  const s = (bio || "").trim();
  if (!s) return "";
  if (/<\/?(p|br|strong|em|b|i|h[1-6]|ul|ol|li|a|div|span)[\s>/]/i.test(s)) return sanitizeBio(s);
  return s.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>").join("");
}

/** The bio as clean plain text, for booking forms: blank lines between paragraphs, "- " list items, links as "text (url)". */
export function bioToText(bio: string): string {
  const html = bioToHtml(bio);
  const t = html
    .replace(/<br>/g, "\n")
    .replace(/<\/(p|h3)>/g, "\n\n").replace(/<\/(ul|ol)>/g, "\n")
    .replace(/<li>/g, "\u0001").replace(/<\/li>/g, "\n")
    .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, h: string, x: string) => {
      const u = decode(h).replace(/^mailto:/, "");
      return x === u ? x : x + " (" + u + ")";
    })
    .replace(/<[^>]+>/g, "");
  return decode(t).replace(/\u0001/g, "- ").replace(/\n{3,}/g, "\n\n").trim();
}

/** The words in a bio, for the count under the editor. */
export const bioWords = (bio: string): number => bioToText(bio).replace(/^- /gm, "").split(/\s+/).filter(Boolean).length;
/** Visible length: the text, not the tags. */
export const bioLength = (bio: string): number => bioToText(bio).length;

export const BIO_TEXT_MAX = 5000;
export const BIO_HTML_MAX = 20000;
