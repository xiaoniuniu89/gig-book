// Browser side of the recording-details route. Throws a short message on any failure; callers carry on without it.
import { getSupabase } from "../supabase/client";

export async function suggestRecording(r: { tune: string; composer: string; player: string; instrument: string }): Promise<string> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use this.");
  let res: Response;
  try {
    res = await fetch("/api/ai/recording", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(r) });
  } catch { throw new Error("Couldn't reach the server."); }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || "That didn't work (" + res.status + ").");
  return typeof j?.recording === "string" ? j.recording : "";
}
