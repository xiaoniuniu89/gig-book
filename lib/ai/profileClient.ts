// Browser side of the profile fill route: sends the pasted text or the PDF with the signed-in token.
import { getSupabase } from "../supabase/client";
import type { ProfileSuggestion } from "./profile";

export type { ProfileSuggestion };
export const MAX_FILE = 2 * 1024 * 1024;
export type ProfileSource = { text: string } | { pdf: string; name: string };

const toBase64 = (buf: ArrayBuffer): string => {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Reads a .txt as text, or a PDF as base64 for the server. */
export async function readSource(file: File): Promise<ProfileSource> {
  if (file.size > MAX_FILE) throw new Error("That file is too big. The limit is 2 MB.");
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return { pdf: toBase64(await file.arrayBuffer()), name: file.name };
  if (/\.txt$/i.test(file.name) || file.type === "text/plain") return { text: await file.text() };
  throw new Error("Choose a PDF or a .txt file.");
}

export async function requestProfile(src: ProfileSource): Promise<ProfileSuggestion> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use this.");
  let res: Response;
  try {
    res = await fetch("/api/ai/profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(src) });
  } catch { throw new Error("Couldn't reach the server. Check your connection."); }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "That didn't work (" + res.status + ").");
  return j.suggestion as ProfileSuggestion;
}
