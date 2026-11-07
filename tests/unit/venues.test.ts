import { describe, expect, it } from "vitest";
import { cleanPhotonHits, cleanVenueHits, mapsLink, nominatimUrl, photonUrl } from "@/lib/venues";

describe("cleanVenueHits", () => {
  it("keeps name and address, drops junk and repeats, caps at 5", () => {
    const cavern = { name: "The Cavern", display_name: "The Cavern, 10 Mathew Street, Liverpool, L2 6RE, United Kingdom", address: { house_number: "10", road: "Mathew Street", city: "Liverpool", postcode: "L2 6RE", country: "United Kingdom" } };
    const raw = [
      cavern, cavern,
      { display_name: "Some Pub, High Street, Town" },
      null, 5, { name: "x" },
      ...Array.from({ length: 9 }, (_, i) => ({ display_name: `Place ${i}, Road ${i}, City` })),
    ];
    const r = cleanVenueHits(raw);
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ name: "The Cavern", address: "10 Mathew Street, Liverpool, L2 6RE, United Kingdom" });
    expect(r[1]).toEqual({ name: "Some Pub", address: "High Street, Town" });
  });
  it("strips markup and control characters, clips long text", () => {
    const [h] = cleanVenueHits([{ display_name: "<b>Bad</b>\u0000 Club, " + "x".repeat(900) }]);
    expect(h.name).not.toMatch(/[<>\u0000]/);
    expect(h.address.length).toBeLessThanOrEqual(300);
  });
  it("returns nothing for non-arrays", () => { expect(cleanVenueHits({})).toEqual([]); expect(cleanVenueHits(null)).toEqual([]); });
});

describe("cleanPhotonHits", () => {
  const f = (properties: Record<string, unknown>) => ({ properties: { countrycode: "IE", ...properties } });
  it("puts venues above streets, keeping the service's order within each", () => {
    const r = cleanPhotonHits({ features: [
      f({ name: "Whelans Park", city: "Dublin", osm_key: "highway", osm_value: "residential" }),
      f({ name: "Whelan's Butchers", street: "Main Street", city: "Athy", osm_key: "shop", osm_value: "butcher" }),
      f({ name: "Whelan's", housenumber: "25", street: "Wexford Street", city: "Dublin", postcode: "D02 H527", osm_key: "amenity", osm_value: "pub" }),
    ] });
    expect(r.map(x => x.name)).toEqual(["Whelan's", "Whelan's Butchers", "Whelans Park"]);
    expect(r[0].address).toBe("25 Wexford Street, Dublin, D02 H527, Ireland");
  });
  it("keeps Northern Ireland, drops Scotland and anywhere else", () => {
    const r = cleanPhotonHits({ features: [
      f({ countrycode: "GB", state: "Northern Ireland", name: "Ulster Hall", street: "Linenhall Street", city: "Belfast", osm_key: "amenity" }),
      f({ countrycode: "GB", state: "Scotland", name: "Campbeltown Bar", city: "Campbeltown", osm_key: "amenity" }),
      f({ countrycode: "FR", name: "Le Bar", city: "Paris", osm_key: "amenity" }),
    ] });
    expect(r).toEqual([{ name: "Ulster Hall", address: "Linenhall Street, Belfast, Northern Ireland" }]);
  });
  it("drops closed venues and uses the county over a council district", () => {
    const r = cleanPhotonHits({ features: [
      f({ name: "Cobblestones Pub", city: "Cork", osm_key: "shop", osm_value: "vacant" }),
      f({ name: "Whelan's", city: "The Municipal District of Cappamore", county: "County Limerick", osm_key: "amenity" }),
    ] });
    expect(r).toEqual([{ name: "Whelan's", address: "County Limerick, Ireland" }]);
  });
  it("names a plain address by its street, caps at 5, and survives junk", () => {
    expect(cleanPhotonHits({ features: [f({ housenumber: "25", street: "William Street", city: "Wexford", osm_key: "place", osm_value: "house" })] }))
      .toEqual([{ name: "25 William Street", address: "Wexford, Ireland" }]);
    expect(cleanPhotonHits({ features: Array.from({ length: 9 }, (_, i) => f({ name: "Pub " + i, city: "Cork", osm_key: "amenity" })) })).toHaveLength(5);
    for (const junk of [null, {}, { features: 5 }, { features: [null, 3, {}] }]) expect(cleanPhotonHits(junk)).toEqual([]);
  });
});

describe("search URLs", () => {
  it("keep both services inside Ireland and encode the search", () => {
    expect(photonUrl("dolan's pub")).toContain("bbox=-10.8,51.3,-5.3,55.5");
    expect(photonUrl("dolan's pub")).toContain("q=dolan's%20pub");
    expect(nominatimUrl("a b")).toContain("bounded=1&viewbox=-10.8,55.5,-5.3,51.3");
  });
  it("Nominatim's Scottish corner is dropped, Northern Ireland kept", () => {
    const hit = (state: string) => ({ name: "A Bar", display_name: "A Bar, 1 Road, Town", address: { house_number: "1", road: "Road", city: "Town", state, country_code: "gb" } });
    expect(cleanVenueHits([hit("Scotland")])).toEqual([]);
    expect(cleanVenueHits([hit("Northern Ireland")])).toHaveLength(1);
  });
});

describe("mapsLink", () => {
  it("builds an encoded search from venue and address", () => {
    expect(mapsLink({ venue: "Ronnie Scott's", address: "47 Frith St\nLondon" }))
      .toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ronnie Scott's, 47 Frith St, London"));
  });
  it("is empty without an address", () => { expect(mapsLink({ venue: "Pub", address: "  " })).toBe(""); });
  it("works without a venue", () => { expect(mapsLink({ venue: "", address: "1 A St" })).toContain("query=1%20A%20St"); });
});
