// Browser side of the lead-sheet route: photos are shrunk to a JPEG first, PDFs sent as they are (3 MB at most).
// Throws a short message on any failure. The server checks the answer; the editor checks it again before saving.
import { getSupabase } from "../supabase/client";
import type { ChartGuess } from "./leadsheet";

export type { ChartGuess };
const MAX = 3 * 1024 * 1024;

const toBase64 = (buf: ArrayBuffer): string => {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A photo redrawn at most 2400px on its long side, as JPEG (small print needs the pixels). */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", 0.85));
  if (!blob || blob.size > MAX) throw new Error("That photo is too big for AI to read. Try a smaller one.");
  return toBase64(await blob.arrayBuffer());
}

export async function chartFromLeadSheet(file: File): Promise<ChartGuess> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use this.");
  let body: string;
  if (file.type.startsWith("image/")) body = JSON.stringify({ image: await shrink(file), mime: "image/jpeg" });
  else {
    if (file.size > MAX) throw new Error("That PDF is too big for AI to read (3 MB at most). The chart can still be typed in.");
    body = JSON.stringify({ pdf: toBase64(await file.arrayBuffer()) });
  }
  let res: Response;
  try {
    res = await fetch("/api/ai/leadsheet", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body });
  } catch { throw new Error("Couldn't reach the server."); }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "That didn't work (" + res.status + ").");
  return j.chart as ChartGuess;
}
