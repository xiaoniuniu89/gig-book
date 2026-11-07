// Browser side of the AI draft route: sends the library's title/composer/style/key only, plus the signed-in token
// and, if you attached one, your list (a photo or PDF).
import { getSupabase } from "../supabase/client";
import { fileSource } from "./transcriptionClient";
import type { LibTune } from "@/components/TunePicker";

export const AI_NOT_SET_UP = "AI drafts aren't set up on this site yet.";
export interface DraftResult { picks: { index: number; reason: string }[]; missing: string[]; left: number | null }

/** How many Niu AI drafts you have left today, or null when it can't tell. */
export async function draftsLeft(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("ai_remaining");
  return error || typeof data !== "number" ? null : data;
}

export async function requestDraft(prompt: string, tunes: LibTune[], file?: File | null): Promise<DraftResult> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use AI drafts.");
  const attached = file ? await fileSource(file) : {};
  let res: Response;
  try {
    res = await fetch("/api/ai/setlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ prompt, tunes: tunes.map(t => ({ title: t.title, composer: t.composer, style: t.style, key: t.key })), ...attached }),
    });
  } catch { throw new Error("Couldn't reach the server. Check your connection."); }
  if (res.status === 503) throw new Error(AI_NOT_SET_UP);
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "AI draft failed (" + res.status + ").");
  return j as DraftResult;
}
