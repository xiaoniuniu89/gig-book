// Browser side of the venue search route.
import { getSupabase } from "./supabase/client";
import type { VenueHit } from "./venues";

export async function searchVenues(q: string): Promise<VenueHit[]> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use this.");
  const res = await fetch("/api/venue-search?q=" + encodeURIComponent(q), { headers: { Authorization: "Bearer " + token } });
  const j = await res.json().catch(() => ({})) as { results?: VenueHit[]; error?: string };
  if (!res.ok) throw new Error(j.error || "Address search isn't working right now.");
  return j.results ?? [];
}
