// Venue search results (from OpenStreetMap Nominatim) and the Google Maps link. Pure, so it is unit tested.
export interface VenueHit { name: string; address: string }

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s : "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** Nominatim's answer cut down to at most 5 plain-text { name, address } pairs; anything odd is dropped. */
export function cleanVenueHits(raw: unknown): VenueHit[] {
  if (!Array.isArray(raw)) return [];
  const out: VenueHit[] = [], seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as { name?: unknown; display_name?: unknown; address?: Record<string, unknown> };
    const full = clip(o.display_name, 300);
    if (!full) continue;
    const parts = full.split(",").map(p => p.trim()).filter(Boolean);
    const name = clip(o.name, 120) || parts[0] || "";
    const rest = parts[0] === name ? parts.slice(1) : parts;
    const a = o.address && typeof o.address === "object" ? o.address : {};
    const street = [clip(a.house_number, 20), clip(a.road, 80)].filter(Boolean).join(" ");
    const place = clip(a.city || a.town || a.village || a.suburb, 80);
    const address = (street && place ? [street, place, clip(a.postcode, 20), clip(a.country, 60)].filter(Boolean).join(", ") : rest.join(", ")).slice(0, 300);
    if (!name || !address) continue;
    const k = (name + "|" + address).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push({ name, address });
    if (out.length === 5) break;
  }
  return out;
}

/** Google Maps search link for a venue and address; "" when there is no address. */
export function mapsLink(g: { venue: string; address: string }): string {
  const address = g.address.replace(/\s*\n\s*/g, ", ").trim();
  if (!address) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([g.venue.trim(), address].filter(Boolean).join(", "));
}
