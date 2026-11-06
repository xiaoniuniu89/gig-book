import { describe, expect, it } from "vitest";
import { buildIcs, parseTime } from "@/lib/calendar/ics";

const gig = { id: "g1", title: "Jazz, live", gig_date: "2030-03-04", start_time: "8pm", venue: "The Club", address: "1 High St", updated_at: "2030-01-01T00:00:00Z", setlists: ["Set 1"], lineup: ["Ava (piano)"] };

describe("ics", () => {
  it("parses times", () => {
    expect(parseTime("20:00")).toEqual([20, 0]);
    expect(parseTime("8pm")).toEqual([20, 0]);
    expect(parseTime("8:30 AM")).toEqual([8, 30]);
    expect(parseTime("12am")).toEqual([0, 0]);
    expect(parseTime("evening")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
  it("builds a timed event with a stable uid", () => {
    const s = buildIcs([gig], "https://x.test", new Date("2030-01-02T00:00:00Z"));
    expect(s).toContain("UID:gig-g1@niurealbook.com");
    expect(s).toContain("DTSTART:20300304T200000");
    expect(s).toContain("SUMMARY:Jazz\\, live");
    expect(s).toContain("LOCATION:The Club\\, 1 High St");
    expect(s).toContain("https://x.test/gigs/g1");
  });
  it("makes an all-day event when the time doesn't parse", () => {
    const s = buildIcs([{ ...gig, start_time: null }], "https://x.test");
    expect(s).toContain("DTSTART;VALUE=DATE:20300304");
    expect(s).toContain("DTEND;VALUE=DATE:20300305");
  });
});
