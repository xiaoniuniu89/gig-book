// Apple Lossless looks like any other .m4a but most browsers can't play it, so catch it before it's uploaded.
export const APPLE_LOSSLESS = "This file is Apple Lossless, which most browsers can't play. Save it as MP3 or AAC and upload that.";

/** True if these bytes are an MP4 audio file whose sample description says `alac`. */
export function isAppleLossless(b: Uint8Array): boolean {
  const is = (i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  // stsd box: "stsd", version and flags (4), entry count (4), entry size (4), then the format
  for (let i = 0; i + 20 <= b.length; i++) if (b[i] === 0x73 && is(i, "stsd") && is(i + 16, "alac")) return true;
  return false;
}

/** Throws when a recording won't play for people. Only looks inside MP4-style files. */
export async function checkAudio(file: File): Promise<void> {
  if (!/\.(m4a|mp4|m4b|caf)$/i.test(file.name) && !/mp4|m4a/i.test(file.type)) return;
  if (isAppleLossless(new Uint8Array(await file.arrayBuffer()))) throw new Error(APPLE_LOSSLESS);
}
