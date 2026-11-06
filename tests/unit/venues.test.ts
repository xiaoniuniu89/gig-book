import { describe, expect, it } from "vitest";
import { cleanVenueHits, mapsLink } from "@/lib/venues";

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

describe("mapsLink", () => {
  it("builds an encoded search from venue and address", () => {
    expect(mapsLink({ venue: "Ronnie Scott's", address: "47 Frith St\nLondon" }))
      .toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ronnie Scott's, 47 Frith St, London"));
  });
  it("is empty without an address", () => { expect(mapsLink({ venue: "Pub", address: "  " })).toBe(""); });
  it("works without a venue", () => { expect(mapsLink({ venue: "", address: "1 A St" })).toContain("query=1%20A%20St"); });
});
