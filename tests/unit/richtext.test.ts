// The bio sanitiser: only p, br, strong, em, h3, ul, ol, li and https/mailto links survive.
import { describe, expect, it } from "vitest";
import { bioToHtml, bioToText, bioWords, sanitizeBio } from "@/lib/richtext";

describe("lib/richtext", () => {
  it("removes script tags and what's inside them", () => {
    expect(sanitizeBio("<p>Hi</p><script>alert(1)</script>")).toBe("<p>Hi</p>");
    expect(sanitizeBio("<SCRIPT src=x></SCRIPT><p>a</p>")).toBe("<p>a</p>");
  });
  it("removes event handlers and unknown attributes", () => {
    const o = sanitizeBio('<p onclick="x()" style="color:red">Hi <strong onmouseover="y()">there</strong></p><img src=x onerror=alert(1)>');
    expect(o).toBe("<p>Hi <strong>there</strong></p>");
    expect(o).not.toMatch(/onerror|onclick|onmouseover|style|img/i);
  });
  it("only keeps https: and mailto: links, with a safe rel", () => {
    expect(sanitizeBio('<p><a href="javascript:alert(1)">x</a></p>')).toBe("<p>x</p>");
    expect(sanitizeBio('<p><a href=" JaVa\tScRiPt:alert(1)">x</a></p>')).toBe("<p>x</p>");
    expect(sanitizeBio('<p><a href="data:text/html,hi">x</a></p>')).toBe("<p>x</p>");
    expect(sanitizeBio('<p><a href="http://a.com">x</a></p>')).toBe("<p>x</p>");
    expect(sanitizeBio('<p><a href="https://a.com/?q=1&r=2" target="_blank" onclick="z">x</a></p>'))
      .toBe('<p><a href="https://a.com/?q=1&amp;r=2" rel="noopener noreferrer nofollow">x</a></p>');
    expect(sanitizeBio('<p><a href="mailto:a@b.com">mail</a></p>')).toContain('href="mailto:a@b.com"');
  });
  it("escapes text so it can't turn back into tags", () => {
    expect(sanitizeBio("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(sanitizeBio("<p>a < b</p>")).not.toMatch(/<\s*b/);
  });
  it("cleans Word and Google Docs markup", () => {
    const word = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="margin:0"><span style="font-size:11pt"><b>Bold</b> and <i>italic</i></span></p><div><span>Next</span></div><h1 class="x">Title</h1><ul><li><p>One</p></li><li>Two</li></ul><o:p></o:p></b>';
    const o = sanitizeBio(word);
    expect(o).toContain("<strong>Bold</strong>");
    expect(o).toContain("<em>italic</em>");
    expect(o).toContain("<h3>Title</h3>");
    expect(o).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(o).not.toMatch(/span|style|class|dir=|meta|<div|<h1/i);
  });
  it("closes tags it opened and is idempotent", () => {
    const o = sanitizeBio("<p>a <strong>b <em>c");
    expect(o).toBe("<p>a <strong>b <em>c</em></strong></p>");
    expect(sanitizeBio(o)).toBe(o);
  });
  it("treats old plain text as paragraphs split on blank lines", () => {
    expect(bioToHtml("One & two\nstill one\n\nThree")).toBe("<p>One &amp; two<br>still one</p><p>Three</p>");
  });
  it("makes clean plain text and counts words", () => {
    const html = '<h3>Hi</h3><p>Some <strong>bold</strong> text <a href="https://a.com" rel="noopener noreferrer nofollow">site</a></p><ul><li>one</li><li>two</li></ul>';
    expect(bioToText(html)).toBe("Hi\n\nSome bold text site (https://a.com)\n\n- one\n- two");
    expect(bioWords(html)).toBe(8);
  });
});
