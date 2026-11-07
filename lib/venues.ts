// Venue search (OpenStreetMap, the island of Ireland only) and the Google Maps link. Pure, so it is unit tested.
export interface VenueHit { name: string; address: string }

// the island of Ireland as west, south, east, north; the box clips a corner of Scotland, which the cleaners drop
const WEST = -10.8, SOUTH = 51.3, EAST = -5.3, NORTH = 55.5;
/** Photon forgives typos and missing apostrophes. Ask for extra so ranking still has 5 good ones to show. */
export const photonUrl = (q: string) => `https://photon.komoot.io/api/?limit=15&lang=en&bbox=${WEST},${SOUTH},${EAST},${NORTH}&q=` + encodeURIComponent(q);
/** Nominatim is stricter: the backup when Photon is down or finds nothing. */
export const nominatimUrl = (q: string) => `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&bounded=1&viewbox=${WEST},${NORTH},${EAST},${SOUTH}&q=` + encodeURIComponent(q);

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s : "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const NI = "Northern Ireland";
const VENUE_KEYS = new Set(["amenity", "leisure", "tourism"]), MAP_KEYS = new Set(["highway", "place", "boundary", "landuse"]);

/** Photon's answer as at most 5 plain-text { name, address } pairs in Ireland, north or south: venues first, then other buildings, then streets and towns. */
export function cleanPhotonHits(raw: unknown): VenueHit[] {
  const features = (raw as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const found: { hit: VenueHit; rank: number }[] = [], seen = new Set<string>();
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> } | null)?.properties;
    if (!p || typeof p !== "object") continue;
    const north = p.countrycode === "GB" && p.state === NI;
    if (p.countrycode !== "IE" && !north) continue;
    if (p.osm_value === "vacant") continue; // closed down
    const key = clip(p.osm_key, 40);
    const street = [clip(p.housenumber, 20), clip(p.street, 80)].filter(Boolean).join(" ");
    const city = clip(p.city, 80);
    // rural places come back with a council district for a city: the county reads better
    const place = city && !/municipal district/i.test(city) ? city : clip(p.county, 80) || clip(p.locality, 80);
    const name = clip(p.name, 120) || street;
    const address = [street === name ? "" : street, place === name ? "" : place, clip(p.postcode, 20), north ? NI : "Ireland"].filter(Boolean).join(", ").slice(0, 300);
    if (!name) continue;
    const k = (name + "|" + address).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    found.push({ hit: { name, address }, rank: VENUE_KEYS.has(key) ? 0 : p.housenumber || (p.name && !MAP_KEYS.has(key)) ? 1 : 2 });
  }
  return found.sort((a, b) => a.rank - b.rank).slice(0, 5).map(x => x.hit); // sort is stable: Photon's best match stays first within a rank
}

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
    if (a.country_code === "gb" && a.state !== NI) continue; // the corner of Scotland inside the box
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
