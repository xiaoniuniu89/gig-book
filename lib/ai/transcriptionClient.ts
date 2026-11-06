// Browser side of the transcription-reading route: photos are shrunk to a JPEG first, PDFs sent as they are (3 MB at most),
// MusicXML as its text. Throws a short message on any failure; the form carries on without it.
import { getSupabase } from "../supabase/client";
import type { TranscriptionGuess, TranscriptionSource } from "./transcription";

export type { TranscriptionGuess };
const MAX = 3 * 1024 * 1024;

const toBase64 = (buf: ArrayBuffer): string => {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A photo redrawn at most 2000px on its long side, as JPEG. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that photo.");
  return toBase64(await blob.arrayBuffer());
}

async function source(file: File): Promise<TranscriptionSource> {
  if (file.type.startsWith("image/")) return { image: await shrink(file), mime: "image/jpeg" };
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX) throw new Error("That PDF is too big for AI to read (3 MB at most).");
    return { pdf: toBase64(await file.arrayBuffer()) };
  }
  if (/\.mxl$/i.test(file.name)) throw new Error("AI can't read a compressed .mxl file.");
  return { text: (await file.text()).slice(0, 30_000) };
}

export async function readTranscriptionFile(file: File): Promise<TranscriptionGuess> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use this.");
  const body = JSON.stringify(await source(file));
  let res: Response;
  try {
    res = await fetch("/api/ai/transcription", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body });
  } catch { throw new Error("Couldn't reach the server."); }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "That didn't work (" + res.status + ").");
  return j.guess as TranscriptionGuess;
}
