import { describe, expect, it } from "vitest";
import { cleanLink, isPublicIp, pageText, pdfLinkIn, sniff } from "@/lib/ai/sheetLink";
import { validateFound } from "@/lib/ai/leadsheetSearch";
import { clock, parseClock, youtubeStart } from "@/lib/youtube/ids";

describe("opening a link", () => {
  it("refuses addresses that aren't public", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "nonsense"]) expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicIp(ip), ip).toBe(true);
  });
  it("only opens plain http(s) links", () => {
    for (const u of ["file:///etc/passwd", "ftp://a.com/x", "https://a:b@a.com/", "http://a.com:8080/", "not a link"]) expect(cleanLink(u), u).toBeNull();
    expect(cleanLink("https://a.com/x.pdf")?.href).toBe("https://a.com/x.pdf");
  });
  it("tells files by their first bytes", () => {
    expect(sniff(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("finds the PDF on a page and reads its words", () => {
    const html = `<a href="/bb.pdf">Bb</a><a href="/c.pdf">Concert</a><script>x()</script><p>Dm7 &amp; G7</p>`;
    expect(pdfLinkIn(html, new URL("https://a.com/p"))?.href).toBe("https://a.com/c.pdf");
    expect(pageText(html)).not.toContain("x()");
    expect(pageText(html)).toContain("Dm7 & G7");
  });
  it("keeps only safe results", () => {
    const r = validateFound({ results: [{ title: "<b>A</b>", url: "https://www.a.com/x" }, { title: "bad", url: "javascript:alert(1)" }, { url: "https://www.a.com/x" }] });
    expect(r).toHaveLength(1);
    expect(r[0].site).toBe("a.com");
    expect(validateFound(null)).toEqual([]);
  });
});

describe("times on a video", () => {
  it("reads times", () => {
    expect(parseClock("12:34")).toBe(754);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("754")).toBe(754);
    expect(parseClock("12m34s")).toBe(754);
    expect(parseClock("soon")).toBeNull();
    expect(clock(3723)).toBe("1:02:03");
    expect(clock(754)).toBe("12:34");
  });
  it("reads the start in a link", () => {
    expect(youtubeStart("https://youtu.be/abc?t=754")).toBe(754);
    expect(youtubeStart("https://www.youtube.com/watch?v=abc&t=12m34s")).toBe(754);
    expect(youtubeStart("https://www.youtube.com/live/isD1X3sjQn8?si=jqoM")).toBe(0);
  });
});
