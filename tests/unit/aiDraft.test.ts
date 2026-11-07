// Drafting a setlist, with or without a list to read (R9.2).
import { describe, expect, it } from "vitest";
import { MAX_FILE_LIBRARY, MAX_FILE_TUNES, MAX_LIBRARY, MAX_TUNES, parseRequest, validate } from "@/lib/ai/draft";

const tunes = (n: number) => Array.from({ length: n }, (_, i) => ({ title: "T" + i, composer: "", style: "", key: "" }));

describe("parseRequest", () => {
  it("needs words, unless there's a file to read", () => {
    expect(parseRequest({ prompt: " ", tunes: tunes(1) })).toBeNull();
    expect(parseRequest({ prompt: "", tunes: tunes(1), image: "AAAA", mime: "image/jpeg" })?.prompt).toBe("");
    expect(parseRequest({ prompt: "", tunes: tunes(1), pdf: "AAAA" })?.prompt).toBe("");
    expect(parseRequest({ prompt: "Wedding", tunes: [] })).toBeNull();
  });
  it("sends more of a big library when a list has to be matched against it", () => {
    expect(parseRequest({ prompt: "x", tunes: tunes(3000) })!.tunes).toHaveLength(MAX_LIBRARY);
    expect(parseRequest({ prompt: "x", tunes: tunes(3000), pdf: "AAAA" })!.tunes).toHaveLength(MAX_FILE_LIBRARY);
  });
});

describe("validate", () => {
  it("keeps only real picks, once each, and the songs it couldn't match as plain text", () => {
    const d = validate({ tunes: [{ id: 1, reason: "ok" }, { id: 1 }, { id: 99 }, { id: "x" }], missing: ["Wave <b>", "http://evil.example", 5, "Song ".repeat(50)] }, 3);
    expect(d.picks).toEqual([{ index: 1, reason: "ok" }]);
    expect(d.missing[0]).toBe("Wave b");
    expect(d.missing.join()).not.toContain("http");
    expect(d.missing).toHaveLength(2);
    expect(d.missing[1].length).toBeLessThanOrEqual(80);
  });
  it("has no missing songs when there's no list, and survives junk", () => {
    expect(validate({ tunes: [{ id: 0 }] }, 1).missing).toEqual([]);
    expect(validate(null, 1)).toEqual({ picks: [], missing: [] });
    expect(validate({ tunes: "no", missing: "no" }, 1)).toEqual({ picks: [], missing: [] });
  });
  it("lets a list run longer than a normal draft", () => {
    const many = { tunes: Array.from({ length: 80 }, (_, id) => ({ id })) };
    expect(validate(many, 80).picks).toHaveLength(MAX_TUNES);
    expect(validate(many, 80, MAX_FILE_TUNES).picks).toHaveLength(MAX_FILE_TUNES);
  });
});
