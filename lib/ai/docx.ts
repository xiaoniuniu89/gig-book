// Plain text out of a .docx in the browser, no dependency: a .docx is a zip, and the words are in word/document.xml.
const MAX_XML = 8 * 1024 * 1024; // uncompressed size we'll read

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The text of a word-processing XML part: paragraphs and breaks become newlines, tags are dropped. */
export function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] !== "#") return ENT[e.toLowerCase()];
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Reads word/document.xml from the zip and returns its text. Throws a plain-words error when it can't. */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const bad = new Error("Couldn't read that Word file. Save it as .docx or PDF and try again.");
  const v = new DataView(buf), b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad;
  let p = v.getUint32(eocd + 16, true);
  for (let n = v.getUint16(eocd + 10, true); n > 0 && p + 46 <= buf.byteLength; n--) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    if (name === "word/document.xml") {
      if (usize > MAX_XML || off + 30 > buf.byteLength) throw bad;
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const data = b.subarray(start, start + csize);
      let xml: Uint8Array;
      if (method === 0) xml = data;
      else if (method === 8 && typeof DecompressionStream !== "undefined") {
        xml = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      } else throw bad;
      if (xml.length > MAX_XML) throw bad;
      return xmlToText(new TextDecoder().decode(xml));
    }
    p += 46 + nl + xl + cl;
  }
  throw bad;
}
