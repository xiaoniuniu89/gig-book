import { describe, expect, it } from "vitest";
import { playbackSupport } from "@/lib/playback";

const UA = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
};

describe("playbackSupport", () => {
  it("picks a row per browser", () => {
    expect(playbackSupport(UA.chrome).id).toBe("chromium");
    expect(playbackSupport(UA.edge).id).toBe("chromium");
    expect(playbackSupport(UA.firefox).id).toBe("firefox");
    expect(playbackSupport(UA.safari).id).toBe("safari");
    expect(playbackSupport(UA.iphone).id).toBe("ios");
    expect(playbackSupport(UA.android).id).toBe("android");
    expect(playbackSupport(UA.androidFirefox).id).toBe("other");
    expect(playbackSupport("").id).toBe("other");
  });
  it("uses the extras for Brave and iPadOS", () => {
    expect(playbackSupport(UA.chrome, { brave: true }).id).toBe("brave");
    expect(playbackSupport(UA.safari, { touchMac: true }).id).toBe("ios");
    expect(playbackSupport(UA.safari, { touchMac: false }).level).toBe("preview");
  });
});
