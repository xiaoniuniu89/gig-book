// Lyrics as plain text: an optional "# Name" first line names the version; a line like "[A]" or "[Chorus]" starts a section.
import { unroll, type Bar } from "./ireal";

export const LYRIC_SECTIONS = ["Intro", "A", "B", "C", "Verse", "Chorus", "Bridge", "Ending"];
export const DEFAULT_NAME = "Lyrics";
const HEAD = /^\s*\[([^\]\n]{1,24})\]\s*$/;
const NAME = /^# (.{1,40})$/;

/** The version's name (from a "# Name" first line) and its words. */
export function splitName(body: string): { name: string; text: string } {
  const [first, ...rest] = body.split("\n");
  const m = NAME.exec(first);
  return m ? { name: m[1].trim() || DEFAULT_NAME, text: rest.join("\n") } : { name: DEFAULT_NAME, text: body };
}
export const joinName = (name: string, text: string): string => {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
  return n && n !== DEFAULT_NAME ? "# " + n + "\n" + text : text;
};

export interface LyricBlock { label: string | null; lines: string }
/** Splits the words into blocks at section lines; text before the first one has no label. Empty unlabelled blocks are dropped. */
export function blocks(text: string): LyricBlock[] {
  const out: { label: string | null; rows: string[] }[] = [{ label: null, rows: [] }];
  for (const line of text.split("\n")) {
    const m = HEAD.exec(line);
    if (m) out.push({ label: m[1].trim(), rows: [] });
    else out[out.length - 1].rows.push(line);
  }
  return out.map(b => ({ label: b.label, lines: b.rows.join("\n").replace(/^([ \t]*\n)+/, "").replace(/\s+$/, "") }))
    .filter(b => b.label !== null || b.lines);
}

/** The tune's form as played, from the chart's section letters through repeats: e.g. A A B A. Empty when the chart has no letters. */
export function formOf(bars: Bar[]): string[] {
  const out: string[] = [];
  let prev = -1;
  for (const i of unroll(bars)) {
    if (bars[i].section || i < prev) {
      let j = i;
      while (j > 0 && !bars[j].section) j--;
      if (bars[j].section) out.push(bars[j].section as string);
    }
    prev = i;
  }
  return out;
}

/** An empty template following the form: "[A]\n\n[A]\n\n[B]…". */
export const formTemplate = (form: string[]): string => form.map(s => "[" + s + "]\n").join("\n");
