// Browser side of the AI draft route: sends the library's title/composer/style/key only, plus the signed-in token.
import { getSupabase } from "../supabase/client";
import type { LibTune } from "@/components/TunePicker";

export const AI_NOT_SET_UP = "AI drafts aren't set up on this site yet.";
export interface DraftResult { picks: { index: number; reason: string }[]; spotifyQuery: string }

export async function requestDraft(prompt: string, tunes: LibTune[]): Promise<DraftResult> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use AI drafts.");
  let res: Response;
  try {
    res = await fetch("/api/ai/setlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ prompt, tunes: tunes.map(t => ({ title: t.title, composer: t.composer, style: t.style, key: t.key })) }),
    });
  } catch { throw new Error("Couldn't reach the server. Check your connection."); }
  if (res.status === 503) throw new Error(AI_NOT_SET_UP);
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "AI draft failed (" + res.status + ").");
  return j as DraftResult;
}
